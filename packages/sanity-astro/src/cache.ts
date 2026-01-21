/**
 * Cloudflare Cache API with Stale-While-Revalidate support
 * and tag-based cache invalidation via Sanity syncTags.
 *
 * Based on: https://gist.github.com/richardscarrott/0d54f2252d434ce90d6f743192fe4d91
 */

import { CACHE_INTERNAL_URL } from './constants'

// Cloudflare Workers extends CacheStorage with a default property
declare global {
  interface CacheStorage {
    default: Cache
  }
}

export type CacheOptions = {
  /**
   * How long the response is considered fresh (in seconds)
   * @default 300 (5 minutes)
   */
  maxAge?: number
  /**
   * How long stale content can be served while revalidating (in seconds)
   * @default 3600 (1 hour)
   */
  staleWhileRevalidate?: number
  /**
   * Cache key prefix for namespacing
   * @default 'sanity'
   */
  keyPrefix?: string
}

/**
 * Internal type for cache entries with tags
 */
type CacheEntry<T> = {
  data: T
  tags?: string[]
}

/**
 * Tag index maps tags to cache key URLs
 */
type TagIndex = {
  [tag: string]: string[] // tag -> array of cache key URLs
}

type FetchFunction<T> = () => Promise<{ data: T; tags?: string[] }>

type CacheResult<T> = {
  data: T
  status: 'HIT' | 'MISS' | 'STALE'
  age?: number
}

// Special cache key for the tag index
const TAG_INDEX_KEY = new Request(`${CACHE_INTERNAL_URL}/__tag_index__`)

type ExecutionContext = { waitUntil: (promise: Promise<unknown>) => void } | null

/**
 * Parse cache-control header to extract directives
 */
function parseCacheControl(header: string | null): Record<string, number | boolean> {
  if (!header) return {}

  const directives: Record<string, number | boolean> = {}

  header.split(',').forEach(part => {
    const [key, value] = part.trim().split('=')
    if (value !== undefined) {
      directives[key.toLowerCase()] = parseInt(value, 10)
    } else {
      directives[key.toLowerCase()] = true
    }
  })

  return directives
}

/**
 * Create a cache key from query and params
 */
function createCacheKey(
  query: string,
  params: Record<string, unknown>,
  prefix: string
): Request {
  const url = new URL(CACHE_INTERNAL_URL)
  url.pathname = `/${prefix}`
  url.searchParams.set('q', query)
  url.searchParams.set('p', JSON.stringify(params))
  return new Request(url.toString())
}

/**
 * Calculate the age of a cached response in seconds
 */
function getCacheAge(response: Response): number {
  const cacheTime = response.headers.get('x-cache-time')
  if (!cacheTime) return 0

  const cachedAt = new Date(cacheTime).getTime()
  const now = Date.now()
  return Math.floor((now - cachedAt) / 1000)
}

/**
 * Check if a cached response is still fresh (within maxAge)
 */
function isFresh(response: Response): boolean {
  const cacheControlHeader = response.headers.get('x-cache-control')
  if (!cacheControlHeader) return false

  const directives = parseCacheControl(cacheControlHeader)
  const maxAge = directives['max-age']

  if (typeof maxAge !== 'number') return false

  const age = getCacheAge(response)
  return age <= maxAge
}

/**
 * Check if a cached response is stale but within the SWR window
 */
function isStaleButValid(response: Response): boolean {
  const cacheControlHeader = response.headers.get('x-cache-control')
  if (!cacheControlHeader) return false

  const directives = parseCacheControl(cacheControlHeader)
  const maxAge = directives['max-age']
  const swr = directives['stale-while-revalidate']

  if (typeof maxAge !== 'number' || typeof swr !== 'number') return false

  const age = getCacheAge(response)
  // Stale if past maxAge but within maxAge + swr
  return age > maxAge && age <= (maxAge + swr)
}

/**
 * Get the tag index from cache
 */
async function getTagIndex(cache: Cache): Promise<TagIndex> {
  const response = await cache.match(TAG_INDEX_KEY)
  if (!response) return {}
  return response.json() as Promise<TagIndex>
}

/**
 * Update the tag index in cache
 */
async function updateTagIndex(cache: Cache, index: TagIndex): Promise<void> {
  const response = new Response(JSON.stringify(index), {
    headers: {
      'content-type': 'application/json',
      // Long TTL for tag index - it's updated on every cache write
      'cdn-cache-control': 'max-age=31536000',
    },
  })
  await cache.put(TAG_INDEX_KEY, response)
}

/**
 * Add cache key to tag index
 */
async function addToTagIndex(
  cache: Cache,
  cacheKeyUrl: string,
  tags: string[]
): Promise<void> {
  const index = await getTagIndex(cache)

  for (const tag of tags) {
    if (!index[tag]) {
      index[tag] = []
    }
    if (!index[tag].includes(cacheKeyUrl)) {
      index[tag].push(cacheKeyUrl)
    }
  }

  await updateTagIndex(cache, index)
}

/**
 * Fetch with Cloudflare Cache API and SWR support
 *
 * The fetchFn should return { data, tags } where tags are Sanity syncTags
 * for cache invalidation.
 *
 * @example
 * ```ts
 * const result = await cachedFetch(
 *   ctx,
 *   query,
 *   params,
 *   async () => {
 *     const response = await sanityClient.fetch(query, params, { filterResponse: false })
 *     return { data: response, tags: response.syncTags }
 *   },
 *   { maxAge: 300, staleWhileRevalidate: 3600 }
 * )
 * ```
 */
export async function cachedFetch<T>(
  ctx: ExecutionContext,
  query: string,
  params: Record<string, unknown>,
  fetchFn: FetchFunction<T>,
  options: CacheOptions = {}
): Promise<CacheResult<T>> {
  const {
    maxAge = 300,
    staleWhileRevalidate = 3600,
    keyPrefix = 'sanity',
  } = options

  // If no execution context (e.g., dev mode), skip caching
  if (!ctx) {
    const { data } = await fetchFn()
    return { data, status: 'MISS' }
  }

  // Check if caches API is available (Cloudflare Workers)
  if (typeof caches === 'undefined') {
    const { data } = await fetchFn()
    return { data, status: 'MISS' }
  }

  const cache = caches.default
  if (!cache) {
    const { data } = await fetchFn()
    return { data, status: 'MISS' }
  }

  const cacheKey = createCacheKey(query, params, keyPrefix)
  const cacheKeyUrl = cacheKey.url

  try {
    // Check cache
    const cachedResponse = await cache.match(cacheKey)

    if (cachedResponse) {
      const age = getCacheAge(cachedResponse)
      const entry = await cachedResponse.json() as CacheEntry<T>
      const data = entry.data

      // Check if fresh
      if (isFresh(cachedResponse)) {
        return { data, status: 'HIT', age }
      }

      // Check if stale but within SWR window
      if (isStaleButValid(cachedResponse)) {
        // Revalidate in background
        ctx.waitUntil(
          (async () => {
            try {
              const { data: freshData, tags } = await fetchFn()
              const response = createCacheResponse({ data: freshData, tags }, maxAge, staleWhileRevalidate)
              await cache.put(cacheKey, response)

              // Update tag index if we have tags
              if (tags?.length) {
                await addToTagIndex(cache, cacheKeyUrl, tags)
              }
            } catch {
              // Silently ignore background revalidation errors
            }
          })()
        )

        return { data, status: 'STALE', age }
      }

      // Cache expired (past SWR window) - fetch fresh
    }

    // Cache miss or expired - fetch fresh data
    const { data, tags } = await fetchFn()

    console.log('[Cache] MISS - Storing with tags:', tags?.length ?? 0, tags?.slice(0, 3))

    // Store in cache (don't await)
    const response = createCacheResponse({ data, tags }, maxAge, staleWhileRevalidate)
    ctx.waitUntil(
      (async () => {
        await cache.put(cacheKey, response)
        console.log('[Cache] Stored cache entry at:', cacheKeyUrl)

        // Update tag index if we have tags
        if (tags?.length) {
          await addToTagIndex(cache, cacheKeyUrl, tags)
          console.log('[Cache] Added', tags.length, 'tags to index')
        }
      })()
    )

    return { data, status: 'MISS' }
  } catch {
    // On cache error, fall back to direct fetch
    const { data } = await fetchFn()
    return { data, status: 'MISS' }
  }
}

/**
 * Create a cacheable response with proper headers
 */
function createCacheResponse<T>(
  entry: CacheEntry<T>,
  maxAge: number,
  staleWhileRevalidate: number
): Response {
  return new Response(JSON.stringify(entry), {
    headers: {
      'content-type': 'application/json',
      // Browser should not cache (we handle it at the edge)
      'cache-control': 'no-cache, no-store, must-revalidate',
      // Edge cache control (used by our SWR logic)
      'x-cache-control': `max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
      // Cloudflare's edge cache directive
      'cdn-cache-control': `max-age=${maxAge + staleWhileRevalidate}`,
      // Timestamp for debugging
      'x-cache-time': new Date().toISOString(),
    },
  })
}

/**
 * Get debug info about the cache state.
 * Useful for debugging cache invalidation issues.
 */
export async function getCacheDebugInfo(): Promise<{
  available: boolean
  tagIndex: Record<string, string[]>
  tagCount: number
  keyCount: number
}> {
  if (typeof caches === 'undefined') {
    return { available: false, tagIndex: {}, tagCount: 0, keyCount: 0 }
  }

  const cache = caches.default
  if (!cache) {
    return { available: false, tagIndex: {}, tagCount: 0, keyCount: 0 }
  }

  const tagIndex = await getTagIndex(cache)
  const allKeys = new Set<string>()
  for (const keys of Object.values(tagIndex)) {
    for (const key of keys) {
      allKeys.add(key)
    }
  }

  return {
    available: true,
    tagIndex,
    tagCount: Object.keys(tagIndex).length,
    keyCount: allKeys.size,
  }
}

/**
 * Purge cache entries by tags
 *
 * This is called when Sanity live events indicate content has changed.
 * It looks up the tag index to find which cache entries need to be purged.
 *
 * @returns Object with purged cache keys and tags
 */
export async function purgeCacheByTags(
  tags: string[]
): Promise<{ purgedKeys: string[]; purgedTags: string[] }> {
  // Check if caches API is available
  if (typeof caches === 'undefined') {
    return { purgedKeys: [], purgedTags: [] }
  }

  const cache = caches.default
  if (!cache) {
    return { purgedKeys: [], purgedTags: [] }
  }

  try {
    const index = await getTagIndex(cache)
    const purgedKeys = new Set<string>()
    const purgedTags: string[] = []

    for (const tag of tags) {
      if (index[tag]) {
        purgedTags.push(tag)

        for (const cacheKeyUrl of index[tag]) {
          // Delete the cache entry
          const deleted = await cache.delete(new Request(cacheKeyUrl))
          if (deleted) {
            purgedKeys.add(cacheKeyUrl)
          }
        }

        // Remove tag from index
        delete index[tag]
      }
    }

    // Update the tag index
    await updateTagIndex(cache, index)

    return {
      purgedKeys: Array.from(purgedKeys),
      purgedTags,
    }
  } catch {
    return { purgedKeys: [], purgedTags: [] }
  }
}
