/// <reference types="astro/client" />

import { createQueryStore } from '@sanity/react-loader'
import {
  type ClientConfig,
  createClient as sanityCreateClient,
  type SanityClient,
  type QueryParams,
} from '@sanity/client'
import { setConfig, addTags, resetTags } from './config'
import { LIVE_EVENT_COOKIE, VISUAL_EDITING_ENABLED, DEFAULT_API_VERSION } from './constants'
import { cachedFetch, type CacheOptions } from './cache'

export type StegaConfig = {
  /**
   * The URL to the Sanity Studio (e.g., '/cms' or 'https://my-studio.sanity.studio')
   * @default '/cms'
   */
  studioUrl?: string
}

export type SanityLoaderConfig = {
  client?: Omit<ClientConfig, 'projectId' | 'dataset'>
  /**
   * Stega configuration for visual editing.
   * Stega is automatically enabled when in visual editing mode.
   */
  stega?: StegaConfig
  /**
   * Default cache options for all queries.
   * Can be overridden per-query.
   */
  cache?: CacheOptions
}

export type SanityConfig = {
  projectId: string
  dataset: string
  apiVersion: string
  useCdn?: boolean
}

type AstroGlobal = {
  cookies: {
    get: (name: string) => { value: string } | undefined
    delete: (name: string) => void
    set: (name: string, value: string, options?: { path?: string }) => void
  }
  url: URL
  locals?: {
    // Cloudflare adapter puts ctx directly on locals (not nested under runtime)
    ctx?: ExecutionContext
    // Some setups may have it nested
    runtime?: {
      ctx?: ExecutionContext
    }
  }
}

export type LoadQueryOptions = {
  query: string
  params?: QueryParams
  /**
   * Cache options for this query.
   * Set to `false` to disable caching.
   * @default { maxAge: 300, staleWhileRevalidate: 3600 }
   */
  cache?: CacheOptions | false
}

export type LoadQueryResult<T> = {
  data: T
  sourceMap?: unknown
  perspective: 'published' | 'drafts'
  /** Initial data that can be passed to useSanityData for hydration */
  initial: {
    data: T
    sourceMap: unknown
  }
  /** The GROQ query (needed for useSanityData) */
  query: string
  /** Query params (needed for useSanityData) */
  params: QueryParams
}

// Create a singleton query store with SSR mode
const queryStore = createQueryStore({
  client: false, // Don't initialize client in the store - we set it per-request
  ssr: true,     // Enable SSR mode
})

// Export the hooks from the query store for use in React components
export const { useQuery, useLiveMode } = queryStore

type CreateSanityLoaderReturn = {
  client: SanityClient
  browserClient: SanityClient
  config: SanityConfig
  /**
   * Load content from Sanity with visual editing support.
   * Returns data that can be passed to React islands using useSanityData.
   */
  loadQuery: <T>(
    Astro: AstroGlobal,
    options: LoadQueryOptions
  ) => Promise<LoadQueryResult<T>>
}

// Default cache options
const DEFAULT_CACHE_OPTIONS: CacheOptions = {
  maxAge: 10,               // 10 seconds fresh (for testing, increase in production)
  staleWhileRevalidate: 30, // 30 seconds stale window (for testing, increase in production)
  keyPrefix: 'sanity',
}

/**
 * Creates a Sanity loader with support for live preview in React islands.
 * Reads from PUBLIC_SANITY_PROJECT_ID and PUBLIC_SANITY_DATASET environment variables.
 */
export function createSanityLoader(config?: SanityLoaderConfig): CreateSanityLoaderReturn {
  const projectId = import.meta.env.PUBLIC_SANITY_PROJECT_ID
  const dataset = import.meta.env.PUBLIC_SANITY_DATASET
  const apiVersion = import.meta.env.PUBLIC_SANITY_API_VERSION

  if (!projectId) {
    throw new Error(
      'PUBLIC_SANITY_PROJECT_ID environment variable is not defined. ' +
        'Add it to your .env file or astro.config.mjs env schema.'
    )
  }

  if (!dataset) {
    throw new Error(
      'PUBLIC_SANITY_DATASET environment variable is not defined. ' +
        'Add it to your .env file or astro.config.mjs env schema.'
    )
  }

  const sanityConfig: SanityConfig = {
    projectId,
    dataset,
    apiVersion: apiVersion || DEFAULT_API_VERSION,
    useCdn: true,
  }

  const stegaStudioUrl = config?.stega?.studioUrl || '/cms'

  // Token for draft access (server-side only, not PUBLIC_)
  const token = import.meta.env.SANITY_API_READ_TOKEN

  // Regular client without stega (for production)
  const client = sanityCreateClient({
    ...sanityConfig,
    ...config?.client,
  })

  // Client with stega and token for visual editing (draft access)
  const stegaClient = sanityCreateClient({
    ...sanityConfig,
    ...config?.client,
    token,
    useCdn: false, // Can't use CDN with token/drafts
    stega: {
      enabled: true,
      studioUrl: stegaStudioUrl,
    },
  })

  // Browser client for live mode (no token, used client-side)
  const browserClient = sanityCreateClient({
    ...sanityConfig,
    ...config?.client,
    useCdn: false,
    stega: {
      enabled: true,
      studioUrl: stegaStudioUrl,
    },
  })

  // Set the server client for the query store
  queryStore.setServerClient(stegaClient)

  /**
   * Check if visual editing is enabled for this request.
   * Also handles enabling visual editing via URL parameter.
   */
  function isVisualEditingEnabled(Astro: AstroGlobal): boolean {
    // Check for URL parameter to enable visual editing
    if (Astro.url.searchParams.has(VISUAL_EDITING_ENABLED)) {
      // Set cookie so subsequent navigations stay in visual editing mode
      Astro.cookies.set(VISUAL_EDITING_ENABLED, 'true', { path: '/' })
      return true
    }

    // Check for existing visual editing cookie
    const cookie = Astro.cookies.get(VISUAL_EDITING_ENABLED)
    return cookie?.value === 'true'
  }

  async function loadQuery<T>(
    Astro: AstroGlobal,
    { query, params = {}, cache: cacheOption }: LoadQueryOptions
  ): Promise<LoadQueryResult<T>> {
    let lastLiveEventId: string | undefined
    const liveCookie = Astro.cookies.get(LIVE_EVENT_COOKIE)

    if (liveCookie) {
      lastLiveEventId = liveCookie.value
      Astro.cookies.delete(LIVE_EVENT_COOKIE)
      resetTags()
    }

    const visualEditing = isVisualEditingEnabled(Astro)
    // Only use drafts perspective if we have a token
    const perspective = visualEditing && token ? 'drafts' : 'published'
    const activeClient = visualEditing ? stegaClient : client

    // Get Cloudflare execution context for caching
    // Try both locations - direct on locals (new adapter) and nested under runtime (legacy)
    const ctx = Astro.locals?.ctx ?? Astro.locals?.runtime?.ctx ?? null

    // Determine cache options - disable for visual editing, use defaults otherwise
    const shouldCache = !visualEditing && cacheOption !== false
    const cacheOptions = shouldCache
      ? { ...DEFAULT_CACHE_OPTIONS, ...config?.cache, ...(typeof cacheOption === 'object' ? cacheOption : {}) }
      : undefined

    console.log('[loadQuery] Request:', {
      visualEditing,
      hasToken: !!token,
      perspective,
      lastLiveEventId,
      useCdn: !visualEditing,
      caching: shouldCache ? 'enabled' : 'disabled',
      hasExecutionContext: !!ctx,
      query: query.slice(0, 100) + (query.length > 100 ? '...' : ''),
    })

    // Function to fetch from Sanity
    const fetchFromSanity = async () => {
      const response = await activeClient.fetch(
        query,
        params,
        {
          lastLiveEventId,
          filterResponse: false,
          perspective,
          useCdn: !visualEditing,
          resultSourceMap: visualEditing ? 'withKeyArraySelector' : false,
          ...(visualEditing && { cache: 'no-store' }),
        }
      )
      return response
    }

    let result: T
    let syncTags: string[] = []
    let resultSourceMap: unknown

    // Use caching for production queries (non-visual-editing)
    if (shouldCache && cacheOptions) {
      const cacheResult = await cachedFetch<{ result: T; syncTags?: string[]; resultSourceMap?: unknown }>(
        ctx,
        query,
        params,
        fetchFromSanity,
        cacheOptions
      )

      console.log('[loadQuery] Cache status:', cacheResult.status, cacheResult.age ? `(age: ${cacheResult.age}s)` : '')

      result = cacheResult.data.result
      syncTags = cacheResult.data.syncTags ?? []
      resultSourceMap = cacheResult.data.resultSourceMap
    } else {
      // Direct fetch for visual editing (no caching)
      const response = await fetchFromSanity()
      result = response.result as T
      syncTags = response.syncTags ?? []
      resultSourceMap = response.resultSourceMap
    }

    console.log('[loadQuery] Response:', {
      perspective,
      syncTagsCount: syncTags.length,
      hasSourceMap: !!resultSourceMap,
    })

    addTags(syncTags)

    return {
      data: result,
      sourceMap: resultSourceMap,
      perspective,
      query,
      params,
      // Initial data for useQuery hydration
      initial: {
        data: result,
        sourceMap: resultSourceMap,
      },
    }
  }

  setConfig(sanityConfig)

  return { client, browserClient, config: sanityConfig, loadQuery }
}

export { type SanityClient, type QueryParams }
