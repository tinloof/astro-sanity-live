/// <reference types="astro/client" />

import {
  type ClientConfig,
  createClient as sanityCreateClient,
  type SanityClient,
  type QueryParams,
} from '@sanity/client'
import { VISUAL_EDITING_ENABLED, DEFAULT_API_VERSION } from './constants'
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
    set: (name: string, value: string, options?: { path?: string }) => void
  }
  url: URL
  locals?: {
    // Cloudflare adapter puts ctx directly on locals (not nested under runtime)
    ctx?: { waitUntil: (promise: Promise<unknown>) => void }
    // Some setups may have it nested
    runtime?: {
      ctx?: { waitUntil: (promise: Promise<unknown>) => void }
    }
  }
}

export type LoadQueryOptions = {
  query: string
  params?: QueryParams
  /**
   * Cache options for this query.
   * Set to `false` to disable caching.
   * @default { maxAge: 10, staleWhileRevalidate: 30 }
   */
  cache?: CacheOptions | false
}

export type LoadQueryResult<T> = {
  data: T
  perspective: 'published' | 'drafts'
  /** Cache status - HIT, MISS, STALE, or BYPASS (for visual editing) */
  cacheStatus: 'HIT' | 'MISS' | 'STALE' | 'BYPASS'
  /** Cache age in seconds (if cached) */
  cacheAge?: number
  /** Sanity sync tags for cache invalidation */
  tags?: string[]
  /** Query execution time in milliseconds */
  ms: number
}

type CreateSanityLoaderReturn = {
  client: SanityClient
  config: SanityConfig
  /**
   * Load content from Sanity with visual editing support.
   */
  loadQuery: <T>(
    Astro: AstroGlobal,
    options: LoadQueryOptions
  ) => Promise<LoadQueryResult<T>>
}

// Default cache options - with tag-based invalidation, we can cache aggressively
const DEFAULT_CACHE_OPTIONS: CacheOptions = {
  maxAge: 60 * 60,              // 1 hour fresh (invalidated by tags when content changes)
  staleWhileRevalidate: 60 * 60 * 24, // 24 hour stale window (safety net)
  keyPrefix: 'sanity',
}

/**
 * Creates a Sanity loader with support for visual editing.
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
    const startTime = performance.now()

    const visualEditing = isVisualEditingEnabled(Astro)
    // Only use drafts perspective if we have a token
    const perspective = visualEditing && token ? 'drafts' : 'published'
    const activeClient = visualEditing ? stegaClient : client

    // Get Cloudflare execution context for caching
    const ctx = Astro.locals?.ctx ?? Astro.locals?.runtime?.ctx ?? null

    // Determine cache options - disable for visual editing, use defaults otherwise
    const shouldCache = !visualEditing && cacheOption !== false
    const cacheOptions = shouldCache
      ? { ...DEFAULT_CACHE_OPTIONS, ...config?.cache, ...(typeof cacheOption === 'object' ? cacheOption : {}) }
      : undefined

    // Function to fetch from Sanity (returns data and tags for cache)
    const fetchFromSanity = async () => {
      const options = {
        filterResponse: false,
        perspective,
        useCdn: !visualEditing,
        resultSourceMap: visualEditing ? 'withKeyArraySelector' : false,
        // cache option is valid but @sanity/client types don't include it in all overloads
        ...(visualEditing && { cache: 'no-store' }),
      }

      const response = await activeClient.fetch(query, params, options as Parameters<typeof activeClient.fetch>[2])

      // Return both result and syncTags for cache invalidation
      return {
        data: response,
        tags: response.syncTags as string[] | undefined,
      }
    }

    let result: T
    let cacheStatus: 'HIT' | 'MISS' | 'STALE' | 'BYPASS' = 'BYPASS'
    let cacheAge: number | undefined
    let tags: string[] | undefined

    // Use caching for production queries (non-visual-editing)
    if (shouldCache && cacheOptions) {
      const cacheResult = await cachedFetch<{ result: T; syncTags?: string[] }>(
        ctx,
        query,
        params,
        fetchFromSanity,
        cacheOptions
      )

      result = cacheResult.data.result
      cacheStatus = cacheResult.status
      cacheAge = cacheResult.age
      tags = cacheResult.data.syncTags
    } else {
      // Direct fetch for visual editing (no caching)
      const { data: response, tags: responseTags } = await fetchFromSanity()
      result = response.result as T
      tags = responseTags
      cacheStatus = 'BYPASS'
    }

    const ms = Math.round(performance.now() - startTime)

    return {
      data: result,
      perspective,
      cacheStatus,
      cacheAge,
      tags,
      ms,
    }
  }

  return { client, config: sanityConfig, loadQuery }
}

export { type SanityClient, type QueryParams }
