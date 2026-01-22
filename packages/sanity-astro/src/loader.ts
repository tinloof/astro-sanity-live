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
  DEFAULT_PAGE_CACHE_MAX_AGE,
  DEFAULT_PAGE_CACHE_SWR,
  DEFAULT_BROWSER_CACHE_MAX_AGE,
  NO_CACHE_ROUTE_PREFIXES,
  DEFAULT_PURGE_ENDPOINT,
  DEFAULT_REFRESH_DEBOUNCE,
} from './constants'
import {
  cachedFetch,
  createCacheKey,
  createCacheResponse,
  addToTagIndex,
  registerPageWithTags,
  type CacheOptions,
  type PageCacheOptions,
} from './cache'
import { registerConfig, type SanityConfig, type LiveConfig, type StegaConfig } from './config-store'

export type InitSanityConfig = {
  client?: Omit<ClientConfig, 'projectId' | 'dataset'>
  stega?: Partial<StegaConfig>
  /** Query-level cache options */
  cache?: CacheOptions
  /** Page-level CDN cache options */
  pageCache?: PageCacheOptions
  live?: Partial<LiveConfig>
}

export type { SanityConfig } from './config-store'

type AstroGlobal = {
  cookies: {
    get: (name: string) => { value: string } | undefined
    set: (name: string, value: string, options?: { path?: string; maxAge?: number }) => void
    delete: (name: string, options?: { path?: string }) => void
  }
  url: URL
  request?: Request
  response?: {
    headers: Headers
  }
  locals?: {
    ctx?: {
      waitUntil: (promise: Promise<unknown>) => void
    }
    runtime?: {
      ctx?: {
        waitUntil: (promise: Promise<unknown>) => void
      }
    }
  }
}

export type LoadQueryOptions<T = unknown> = {
  query: string
  params?: QueryParams
  /** Query cache options. Set to false to disable query caching. */
  cache?: CacheOptions | false
  /**
   * Page cache options. Controls CDN-Cache-Control headers.
   * Set to false to disable page caching for this request.
   * Only the first loadQuery() call's pageCache options are used per request.
   */
  pageCache?: PageCacheOptions | false
}

export type LoadQueryResult<T> = {
  data: T
  perspective: 'published' | 'drafts'
  cacheStatus: 'HIT' | 'MISS' | 'STALE' | 'BYPASS'
  cacheAge?: number
  tags?: string[]
  ms: number
}

type InitSanityReturn = {
  client: SanityClient
  config: SanityConfig
  loadQuery: <T>(
    Astro: AstroGlobal,
    options: LoadQueryOptions<T>
  ) => Promise<LoadQueryResult<T>>
}

const DEFAULT_CACHE_OPTIONS: CacheOptions = {
  maxAge: DEFAULT_CACHE_MAX_AGE,
  staleWhileRevalidate: DEFAULT_CACHE_SWR,
  keyPrefix: DEFAULT_CACHE_KEY_PREFIX,
}

const DEFAULT_PAGE_CACHE_OPTIONS: PageCacheOptions = {
  maxAge: DEFAULT_PAGE_CACHE_MAX_AGE,
  staleWhileRevalidate: DEFAULT_PAGE_CACHE_SWR,
  browserMaxAge: DEFAULT_BROWSER_CACHE_MAX_AGE,
  disabled: false,
}

/**
 * Check if the current route should skip page caching.
 * This is a safety check - these routes typically don't call loadQuery() anyway.
 */
function shouldSkipPageCache(url: URL): boolean {
  const pathname = url.pathname
  return NO_CACHE_ROUTE_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

/**
 * Collect tags from all loadQuery() calls in a single page request.
 * This is stored in Astro.locals to aggregate tags across multiple queries.
 */
function collectPageTags(locals: AstroGlobal['locals'], tags: string[] | undefined): string[] {
  if (!locals || !tags?.length) return []

  const allTags = (locals as Record<string, unknown>).__sanityPageTags as string[] | undefined ?? []
  const newTags = tags.filter(tag => !allTags.includes(tag))

  if (newTags.length > 0) {
    const combined = [...allTags, ...newTags]
    ;(locals as Record<string, unknown>).__sanityPageTags = combined
    return combined
  }

  return allTags
}

/**
 * Check if page cache headers have already been set for this request.
 */
function hasPageCacheHeadersSet(locals: AstroGlobal['locals']): boolean {
  if (!locals) return false
  return (locals as Record<string, unknown>).__sanityPageCacheSet === true
}

/**
 * Mark that page cache headers have been set for this request.
 */
function markPageCacheHeadersSet(locals: AstroGlobal['locals']): void {
  if (!locals) return
  ;(locals as Record<string, unknown>).__sanityPageCacheSet = true
}

export async function initSanity(config?: InitSanityConfig): Promise<InitSanityReturn> {
  const projectId = import.meta.env.PUBLIC_SANITY_PROJECT_ID
  const dataset = import.meta.env.PUBLIC_SANITY_DATASET
  const apiVersion = import.meta.env.PUBLIC_SANITY_API_VERSION

  if (!projectId) {
    throw new Error(
      'PUBLIC_SANITY_PROJECT_ID environment variable is not defined.'
    )
  }

  if (!dataset) {
    throw new Error(
      'PUBLIC_SANITY_DATASET environment variable is not defined.'
    )
  }

  const sanityConfig: SanityConfig = {
    projectId,
    dataset,
    apiVersion: apiVersion || DEFAULT_API_VERSION,
    useCdn: true,
  }

  const stegaStudioUrl = config?.stega?.studioUrl ?? '/cms'

  registerConfig({
    sanity: sanityConfig,
    live: config?.live,
    stega: { studioUrl: stegaStudioUrl },
  })

  const token = import.meta.env.SANITY_API_READ_TOKEN

  const client = sanityCreateClient({
    ...sanityConfig,
    ...config?.client,
  })

  const stegaClient = sanityCreateClient({
    ...sanityConfig,
    ...config?.client,
    token,
    useCdn: false,
    stega: {
      enabled: true,
      studioUrl: stegaStudioUrl,
    },
  })

  // Merge global page cache options with defaults
  const globalPageCacheOptions: PageCacheOptions = {
    ...DEFAULT_PAGE_CACHE_OPTIONS,
    ...config?.pageCache,
  }

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

  function isVisualEditingEnabled(Astro: AstroGlobal): boolean {
    const cookie = Astro.cookies.get(VISUAL_EDITING_ENABLED)
    return cookie?.value === 'true'
  }

  /**
   * Set page-level cache headers on the Astro response.
   * This enables CDN caching of the full HTML page with SWR semantics.
   *
   * Headers set:
   * - CDN-Cache-Control: For Cloudflare edge cache (uses max-age + stale-while-revalidate)
   * - Cache-Control: For browser cache (shorter, with must-revalidate)
   * - X-Sanity-Tags: Sanity sync tags for debugging/logging
   */
  function setPageCacheHeaders(
    Astro: AstroGlobal,
    tags: string[],
    options: PageCacheOptions
  ): void {
    // Skip if no response object (shouldn't happen in SSR)
    if (!Astro.response?.headers) return

    // Skip if headers already set (multiple loadQuery calls)
    if (hasPageCacheHeadersSet(Astro.locals)) return

    // Skip if page caching is disabled
    if (options.disabled) return

    // Skip for routes that shouldn't be cached
    if (shouldSkipPageCache(Astro.url)) return

    const maxAge = options.maxAge ?? DEFAULT_PAGE_CACHE_MAX_AGE
    const swr = options.staleWhileRevalidate ?? DEFAULT_PAGE_CACHE_SWR
    const browserMaxAge = options.browserMaxAge ?? DEFAULT_BROWSER_CACHE_MAX_AGE

    // CDN-Cache-Control: Tells Cloudflare how to cache at the edge
    // Cloudflare will cache for maxAge, then serve stale for swr window while revalidating
    Astro.response.headers.set(
      'CDN-Cache-Control',
      `public, max-age=${maxAge}, stale-while-revalidate=${swr}`
    )

    // Cache-Control: Browser cache - shorter duration with must-revalidate
    // This ensures browsers check for fresh content more frequently
    Astro.response.headers.set(
      'Cache-Control',
      `public, max-age=${browserMaxAge}, must-revalidate`
    )

    // X-Sanity-Tags: For debugging and logging (visible in response headers)
    if (tags.length > 0) {
      Astro.response.headers.set('X-Sanity-Tags', tags.join(','))
    }

    // Mark headers as set to prevent duplicate setting
    markPageCacheHeadersSet(Astro.locals)
  }

  async function loadQuery<T>(
    Astro: AstroGlobal,
    { query, params = {}, cache: cacheOption, pageCache: pageCacheOption }: LoadQueryOptions<T>
  ): Promise<LoadQueryResult<T>> {
    const startTime = performance.now()
    const visualEditing = isVisualEditingEnabled(Astro)

    // Check for lastLiveEventId (indicates recent content change)
    let lastLiveEventId = (Astro.locals as Record<string, unknown>)?.__sanityLastLiveEventId as string | undefined
    if (!lastLiveEventId) {
      lastLiveEventId = Astro.cookies.get(LAST_LIVE_EVENT_ID_COOKIE)?.value
      if (lastLiveEventId) {
        ;(Astro.locals as Record<string, unknown>).__sanityLastLiveEventId = lastLiveEventId
        Astro.cookies.delete(LAST_LIVE_EVENT_ID_COOKIE, { path: '/' })
      }
    }

    const perspective = visualEditing && token ? 'drafts' : 'published'
    const activeClient = visualEditing ? stegaClient : client
    const ctx = Astro.locals?.ctx ?? Astro.locals?.runtime?.ctx ?? null

    // Merge cache options
    const mergedCacheOptions = {
      ...DEFAULT_CACHE_OPTIONS,
      ...config?.cache,
      ...(typeof cacheOption === 'object' ? cacheOption : {}),
    }

    // Merge page cache options
    const mergedPageCacheOptions: PageCacheOptions = pageCacheOption === false
      ? { ...globalPageCacheOptions, disabled: true }
      : {
          ...globalPageCacheOptions,
          ...(typeof pageCacheOption === 'object' ? pageCacheOption : {}),
        }

    // Determine if query caching should be used
    const shouldCache = !visualEditing && !lastLiveEventId && cacheOption !== false

    // Determine if page caching should be used
    const shouldSetPageHeaders = !visualEditing && !mergedPageCacheOptions.disabled

    const fetchFromSanity = async () => {
      const options = {
        filterResponse: false,
        perspective,
        useCdn: !visualEditing,
        resultSourceMap: visualEditing ? 'withKeyArraySelector' : false,
        ...(lastLiveEventId && { lastLiveEventId }),
        ...(visualEditing && { cache: 'no-store' }),
      }

      const response = await activeClient.fetch(query, params, options as Parameters<typeof activeClient.fetch>[2])

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
        const { data: response, tags: responseTags } = await fetchFromSanity()
        result = response.result as T
        tags = responseTags
        cacheStatus = 'BYPASS'

        // Still cache in background for subsequent requests (if not visual editing)
        if (!visualEditing && ctx && typeof caches !== 'undefined') {
          ctx.waitUntil(
            writeToCache(query, params, response, responseTags, mergedCacheOptions)
          )
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`[Sanity Loader] Failed to fetch: ${message}`)
    }

    // Collect all tags from queries on this page
    const allPageTags = collectPageTags(Astro.locals, tags)

    // Set page cache headers (only on first query, subsequent calls are no-ops)
    if (shouldSetPageHeaders && allPageTags.length > 0) {
      setPageCacheHeaders(Astro, allPageTags, mergedPageCacheOptions)
    }

    // Register page URL with tags for cache invalidation
    // This allows us to purge the page when content changes
    if (shouldSetPageHeaders && tags?.length && ctx) {
      const pageUrl = Astro.url.href
      registerPageWithTags(ctx, pageUrl, tags)
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

export const createSanityLoader = initSanity

export { type SanityClient, type QueryParams }
export { type PageCacheOptions } from './cache'
