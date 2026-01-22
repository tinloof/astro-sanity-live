/**
 * Cloudflare Cache API with Stale-While-Revalidate support
 * and tag-based cache invalidation via Sanity syncTags.
 *
 * This module handles two types of caching:
 * 1. Query cache: Individual Sanity query results cached with the Cache API
 * 2. Page cache: Full HTML page responses cached at the CDN edge via headers
 *
 * Both use Sanity syncTags for targeted invalidation.
 */

import {
  CACHE_INTERNAL_URL,
  DEFAULT_CACHE_MAX_AGE,
  DEFAULT_CACHE_SWR,
  DEFAULT_CACHE_KEY_PREFIX,
  PAGE_INDEX_KEY,
} from './constants'

declare global {
  interface CacheStorage {
    default: Cache
  }
}

export type CacheOptions = {
  maxAge?: number
  staleWhileRevalidate?: number
  keyPrefix?: string
}

export type PageCacheOptions = {
  /** CDN edge cache max-age in seconds (default: 1 hour) */
  maxAge?: number
  /** CDN stale-while-revalidate window in seconds (default: 1 day) */
  staleWhileRevalidate?: number
  /** Browser cache max-age in seconds (default: 60 seconds) */
  browserMaxAge?: number
  /** Disable page caching for this page */
  disabled?: boolean
}

export type CacheEntry<T> = {
  data: T
  tags?: string[]
}

type TagIndex = {
  [tag: string]: string[]
}

type PageIndex = {
  [tag: string]: string[] // tag -> array of page URLs
}

type FetchFunction<T> = () => Promise<{ data: T; tags?: string[] }>

type CacheResult<T> = {
  data: T
  status: 'HIT' | 'MISS' | 'STALE'
  age?: number
}

const TAG_INDEX_KEY = new Request(`${CACHE_INTERNAL_URL}/__tag_index__`)
const PAGE_INDEX_REQUEST = new Request(`${CACHE_INTERNAL_URL}/__page_index__`)

type ExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void
} | null

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

export function createCacheKey(
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

function getCacheAge(response: Response): number {
  const cacheTime = response.headers.get('x-cache-time')
  if (!cacheTime) return 0
  const cachedAt = new Date(cacheTime).getTime()
  const now = Date.now()
  return Math.floor((now - cachedAt) / 1000)
}

function isFresh(response: Response): boolean {
  const cacheControlHeader = response.headers.get('x-cache-control')
  if (!cacheControlHeader) return false
  const directives = parseCacheControl(cacheControlHeader)
  const maxAge = directives['max-age']
  if (typeof maxAge !== 'number') return false
  const age = getCacheAge(response)
  return age <= maxAge
}

function isStaleButValid(response: Response): boolean {
  const cacheControlHeader = response.headers.get('x-cache-control')
  if (!cacheControlHeader) return false
  const directives = parseCacheControl(cacheControlHeader)
  const maxAge = directives['max-age']
  const swr = directives['stale-while-revalidate']
  if (typeof maxAge !== 'number' || typeof swr !== 'number') return false
  const age = getCacheAge(response)
  return age > maxAge && age <= (maxAge + swr)
}

// ============================================================================
// Query Tag Index (for query cache invalidation)
// ============================================================================

async function getTagIndex(cache: Cache): Promise<TagIndex> {
  const response = await cache.match(TAG_INDEX_KEY)
  if (!response) return {}
  return response.json() as Promise<TagIndex>
}

async function updateTagIndex(cache: Cache, index: TagIndex): Promise<void> {
  const response = new Response(JSON.stringify(index), {
    headers: {
      'content-type': 'application/json',
      'cdn-cache-control': 'max-age=31536000',
    },
  })
  await cache.put(TAG_INDEX_KEY, response)
}

export async function addToTagIndex(
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

// ============================================================================
// Page Index (for page cache invalidation)
// ============================================================================

async function getPageIndex(cache: Cache): Promise<PageIndex> {
  const response = await cache.match(PAGE_INDEX_REQUEST)
  if (!response) return {}
  return response.json() as Promise<PageIndex>
}

async function updatePageIndex(cache: Cache, index: PageIndex): Promise<void> {
  const response = new Response(JSON.stringify(index), {
    headers: {
      'content-type': 'application/json',
      'cdn-cache-control': 'max-age=31536000',
    },
  })
  await cache.put(PAGE_INDEX_REQUEST, response)
}

/**
 * Register a page URL with its associated Sanity tags.
 * This allows us to purge the page from CDN cache when content changes.
 */
export async function addToPageIndex(
  cache: Cache,
  pageUrl: string,
  tags: string[]
): Promise<void> {
  const index = await getPageIndex(cache)
  for (const tag of tags) {
    if (!index[tag]) {
      index[tag] = []
    }
    if (!index[tag].includes(pageUrl)) {
      index[tag].push(pageUrl)
    }
  }
  await updatePageIndex(cache, index)
}

/**
 * Add page URL to the page index in the background.
 * This is called after a page successfully loads with tags.
 */
export function registerPageWithTags(
  ctx: ExecutionContext,
  pageUrl: string,
  tags: string[]
): void {
  if (!ctx || !tags?.length) return
  if (typeof caches === 'undefined') return

  const cache = caches.default
  if (!cache) return

  ctx.waitUntil(
    addToPageIndex(cache, pageUrl, tags).catch(() => {
      // Silently ignore errors in background registration
    })
  )
}

// ============================================================================
// Query Cache Operations
// ============================================================================

export async function cachedFetch<T>(
  ctx: ExecutionContext,
  query: string,
  params: Record<string, unknown>,
  fetchFn: FetchFunction<T>,
  options: CacheOptions = {}
): Promise<CacheResult<T>> {
  const {
    maxAge = DEFAULT_CACHE_MAX_AGE,
    staleWhileRevalidate = DEFAULT_CACHE_SWR,
    keyPrefix = DEFAULT_CACHE_KEY_PREFIX,
  } = options

  if (!ctx) {
    const { data } = await fetchFn()
    return { data, status: 'MISS' }
  }

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
    const cachedResponse = await cache.match(cacheKey)

    if (cachedResponse) {
      const age = getCacheAge(cachedResponse)
      const entry = await cachedResponse.json() as CacheEntry<T>
      const data = entry.data

      if (isFresh(cachedResponse)) {
        return { data, status: 'HIT', age }
      }

      if (isStaleButValid(cachedResponse)) {
        ctx.waitUntil(
          (async () => {
            try {
              const { data: freshData, tags } = await fetchFn()
              const response = createCacheResponse({ data: freshData, tags }, maxAge, staleWhileRevalidate)
              await cache.put(cacheKey, response)
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
    }

    const { data, tags } = await fetchFn()
    const response = createCacheResponse({ data, tags }, maxAge, staleWhileRevalidate)

    ctx.waitUntil(
      (async () => {
        await cache.put(cacheKey, response)
        if (tags?.length) {
          await addToTagIndex(cache, cacheKeyUrl, tags)
        }
      })()
    )

    return { data, status: 'MISS' }
  } catch {
    const { data } = await fetchFn()
    return { data, status: 'MISS' }
  }
}

export function createCacheResponse<T>(
  entry: CacheEntry<T>,
  maxAge: number,
  staleWhileRevalidate: number
): Response {
  return new Response(JSON.stringify(entry), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'x-cache-control': `max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
      'cdn-cache-control': `max-age=${maxAge + staleWhileRevalidate}`,
      'x-cache-time': new Date().toISOString(),
    },
  })
}

// ============================================================================
// Cache Purging
// ============================================================================

export type PurgeCacheResult = {
  purgedQueryKeys: string[]
  purgedPageUrls: string[]
  purgedTags: string[]
}

/**
 * Purge both query cache entries and page URLs associated with the given tags.
 */
export async function purgeCacheByTags(
  tags: string[]
): Promise<PurgeCacheResult> {
  const result: PurgeCacheResult = {
    purgedQueryKeys: [],
    purgedPageUrls: [],
    purgedTags: [],
  }

  if (typeof caches === 'undefined') {
    return result
  }

  const cache = caches.default
  if (!cache) {
    return result
  }

  try {
    // 1. Purge query cache entries
    const tagIndex = await getTagIndex(cache)
    const purgedQueryKeys = new Set<string>()

    for (const tag of tags) {
      if (tagIndex[tag]) {
        result.purgedTags.push(tag)
        for (const cacheKeyUrl of tagIndex[tag]) {
          const deleted = await cache.delete(new Request(cacheKeyUrl))
          if (deleted) {
            purgedQueryKeys.add(cacheKeyUrl)
          }
        }
        delete tagIndex[tag]
      }
    }
    result.purgedQueryKeys = Array.from(purgedQueryKeys)

    // Update tag index
    await updateTagIndex(cache, tagIndex)

    // 2. Purge page cache entries
    const pageIndex = await getPageIndex(cache)
    const purgedPageUrls = new Set<string>()

    for (const tag of tags) {
      if (pageIndex[tag]) {
        for (const pageUrl of pageIndex[tag]) {
          // Create a cache key for the page URL
          // Cloudflare caches pages by their full URL
          const pageDeleted = await cache.delete(new Request(pageUrl))
          if (pageDeleted) {
            purgedPageUrls.add(pageUrl)
          }
        }
        delete pageIndex[tag]
      }
    }
    result.purgedPageUrls = Array.from(purgedPageUrls)

    // Update page index
    await updatePageIndex(cache, pageIndex)

    return result
  } catch {
    return result
  }
}

// Legacy function for backward compatibility
export async function getCacheDebugInfo(): Promise<{
  available: boolean
  tagIndex: Record<string, string[]>
  tagCount: number
  keyCount: number
  pageIndex?: Record<string, string[]>
  pageTagCount?: number
  pageUrlCount?: number
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

  const pageIndex = await getPageIndex(cache)
  const allPageUrls = new Set<string>()
  for (const urls of Object.values(pageIndex)) {
    for (const url of urls) {
      allPageUrls.add(url)
    }
  }

  return {
    available: true,
    tagIndex,
    tagCount: Object.keys(tagIndex).length,
    keyCount: allKeys.size,
    pageIndex,
    pageTagCount: Object.keys(pageIndex).length,
    pageUrlCount: allPageUrls.size,
  }
}
