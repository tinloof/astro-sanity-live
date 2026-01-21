/// <reference types="astro/client" />

import {
  type ClientConfig,
  createClient as sanityCreateClient,
  type SanityClient,
  type QueryParams,
} from '@sanity/client'
import {
  VISUAL_EDITING_ENABLED,
  DEFAULT_API_VERSION,
  LAST_LIVE_EVENT_ID_COOKIE,
  DEFAULT_CACHE_MAX_AGE,
  DEFAULT_CACHE_SWR,
  DEFAULT_CACHE_KEY_PREFIX,
} from './constants'
import { cachedFetch, createCacheKey, createCacheResponse, addToTagIndex, type CacheOptions } from './cache'

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
    set: (name: string, value: string, options?: { path?: string; maxAge?: number }) => void
    delete: (name: string, options?: { path?: string }) => void
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
   * @default { maxAge: 86400, staleWhileRevalidate: 604800 }
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

// Default cache options - uses constants, can be overridden per-query
const DEFAULT_CACHE_OPTIONS: CacheOptions = {
  maxAge: DEFAULT_CACHE_MAX_AGE,
  staleWhileRevalidate: DEFAULT_CACHE_SWR,
  keyPrefix: DEFAULT_CACHE_KEY_PREFIX,
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
   * Write data to cache with tags for invalidation.
   */
  async function writeToCache(
    query: string,
    params: QueryParams,
    data: unknown,
    tags: string[] | undefined,
    options: CacheOptions
  ): Promise<void> {
    if (typeof caches === 'undefined') return

    const cache = caches.default
    if (!cache) return

    const cacheKey = createCacheKey(query, params, options.keyPrefix ?? DEFAULT_CACHE_KEY_PREFIX)
    const cacheResponse = createCacheResponse(
      { data, tags },
      options.maxAge ?? DEFAULT_CACHE_MAX_AGE,
      options.staleWhileRevalidate ?? DEFAULT_CACHE_SWR
    )

    await cache.put(cacheKey, cacheResponse)

    if (tags?.length) {
      await addToTagIndex(cache, cacheKey.url, tags)
    }
  }

  /**
   * Check if visual editing is enabled for this request.
   * Visual editing is enabled when the cookie is set (by the client-side
   * component when it detects it's inside Sanity's Presentation tool iframe).
   */
  function isVisualEditingEnabled(Astro: AstroGlobal): boolean {
    const cookie = Astro.cookies.get(VISUAL_EDITING_ENABLED)
    return cookie?.value === 'true'
  }

  async function loadQuery<T>(
    Astro: AstroGlobal,
    { query, params = {}, cache: cacheOption }: LoadQueryOptions
  ): Promise<LoadQueryResult<T>> {
    const startTime = performance.now()

    const visualEditing = isVisualEditingEnabled(Astro)

    // Check for lastLiveEventId from cookie (set by SanityLive after content change)
    // This tells Sanity's CDN to return fresh data, bypassing any stale cached content
    const lastLiveEventId = Astro.cookies.get(LAST_LIVE_EVENT_ID_COOKIE)?.value
    if (lastLiveEventId) {
      // Clear the event ID cookie after reading (single use)
      Astro.cookies.delete(LAST_LIVE_EVENT_ID_COOKIE, { path: '/' })
    }

    // Only use drafts perspective if we have a token
    const perspective = visualEditing && token ? 'drafts' : 'published'
    const activeClient = visualEditing ? stegaClient : client

    // Get Cloudflare execution context for caching
    const ctx = Astro.locals?.ctx ?? Astro.locals?.runtime?.ctx ?? null

    // Merge cache options (used for both caching and re-caching after eventId fetch)
    const mergedCacheOptions = {
      ...DEFAULT_CACHE_OPTIONS,
      ...config?.cache,
      ...(typeof cacheOption === 'object' ? cacheOption : {}),
    }

    // Determine if we should read from cache
    // When we have a lastLiveEventId, we bypass cache read to get fresh data from Sanity
    const shouldCache = !visualEditing && !lastLiveEventId && cacheOption !== false

    // Function to fetch from Sanity (returns data and tags for cache)
    const fetchFromSanity = async () => {
      const options = {
        filterResponse: false,
        perspective,
        useCdn: !visualEditing, // Always use CDN for published content (event ID handles freshness)
        resultSourceMap: visualEditing ? 'withKeyArraySelector' : false,
        // Pass lastLiveEventId to Sanity to get fresh data from CDN
        ...(lastLiveEventId && { lastLiveEventId }),
        // Disable browser cache for visual editing
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

    try {
      // Use caching for production queries (non-visual-editing)
      if (shouldCache) {
        const cacheResult = await cachedFetch<{ result: T; syncTags?: string[] }>(
          ctx,
          query,
          params,
          fetchFromSanity,
          mergedCacheOptions
        )

        result = cacheResult.data.result
        cacheStatus = cacheResult.status
        cacheAge = cacheResult.age
        tags = cacheResult.data.syncTags
      } else {
        // Direct fetch - bypassing cache read but still update cache with fresh data
        const { data: response, tags: responseTags } = await fetchFromSanity()
        result = response.result as T
        tags = responseTags
        cacheStatus = 'BYPASS'

        // Re-populate cache with fresh data and tags (critical for tag index!)
        // This ensures subsequent live events will match the updated syncTags
        if (!visualEditing && ctx && typeof caches !== 'undefined') {
          ctx.waitUntil(
            writeToCache(query, params, response, responseTags, mergedCacheOptions)
          )
        }
      }
    } catch (error) {
      // If fetch fails, throw with more context
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`[Sanity Loader] Failed to fetch: ${message}`)
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
