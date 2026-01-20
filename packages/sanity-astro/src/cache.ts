/**
 * Cloudflare Cache API with Stale-While-Revalidate support
 *
 * Based on: https://gist.github.com/richardscarrott/0d54f2252d434ce90d6f743192fe4d91
 */

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
  /**
   * Tags for cache invalidation (future use with Sanity webhooks)
   */
  tags?: string[]
}

type FetchFunction<T> = () => Promise<T>

type CacheResult<T> = {
  data: T
  status: 'HIT' | 'MISS' | 'STALE'
  age?: number
}

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
  const url = new URL('https://cache.internal')
  url.pathname = `/${prefix}`
  url.searchParams.set('q', query)
  url.searchParams.set('p', JSON.stringify(params))
  return new Request(url.toString())
}

/**
 * Check if a cached response should be revalidated
 */
function shouldRevalidate(response: Response): boolean {
  const ageHeader = response.headers.get('age')
  const cacheControlHeader = response.headers.get('x-cache-control')

  if (!ageHeader || !cacheControlHeader) return false

  const directives = parseCacheControl(cacheControlHeader)
  const swr = directives['stale-while-revalidate']

  if (typeof swr !== 'number') return false

  const age = parseInt(ageHeader, 10)
  if (isNaN(age)) return false

  // Revalidate if age exceeds the stale-while-revalidate window
  return age > swr
}

/**
 * Fetch with Cloudflare Cache API and SWR support
 *
 * @example
 * ```ts
 * const result = await cachedFetch(
 *   ctx,
 *   query,
 *   params,
 *   async () => {
 *     return await sanityClient.fetch(query, params)
 *   },
 *   { maxAge: 300, staleWhileRevalidate: 3600 }
 * )
 * ```
 */
export async function cachedFetch<T>(
  ctx: ExecutionContext | null,
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
  if (!ctx || typeof caches === 'undefined') {
    const data = await fetchFn()
    return { data, status: 'MISS' }
  }

  const cache = caches.default
  const cacheKey = createCacheKey(query, params, keyPrefix)

  try {
    // Check cache
    const cachedResponse = await cache.match(cacheKey)

    if (cachedResponse) {
      const age = parseInt(cachedResponse.headers.get('age') || '0', 10)
      const data = await cachedResponse.json() as T

      // Check if we need to revalidate
      if (shouldRevalidate(cachedResponse)) {
        console.log('[Cache] STALE - serving stale, revalidating in background')

        // Revalidate in background
        ctx.waitUntil(
          (async () => {
            try {
              const freshData = await fetchFn()
              const response = createCacheResponse(freshData, maxAge, staleWhileRevalidate)
              await cache.put(cacheKey, response)
              console.log('[Cache] Background revalidation complete')
            } catch (err) {
              console.error('[Cache] Background revalidation failed:', err)
            }
          })()
        )

        return { data, status: 'STALE', age }
      }

      console.log('[Cache] HIT', { age })
      return { data, status: 'HIT', age }
    }

    // Cache miss - fetch fresh data
    console.log('[Cache] MISS - fetching fresh data')
    const data = await fetchFn()

    // Store in cache (don't await)
    const response = createCacheResponse(data, maxAge, staleWhileRevalidate)
    ctx.waitUntil(cache.put(cacheKey, response))

    return { data, status: 'MISS' }
  } catch (err) {
    console.error('[Cache] Error:', err)
    // On cache error, fall back to direct fetch
    const data = await fetchFn()
    return { data, status: 'MISS' }
  }
}

/**
 * Create a cacheable response with proper headers
 */
function createCacheResponse<T>(
  data: T,
  maxAge: number,
  staleWhileRevalidate: number
): Response {
  return new Response(JSON.stringify(data), {
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
 * Purge cache entries by prefix (for webhook-based invalidation)
 */
export async function purgeCache(prefix: string): Promise<void> {
  // Note: Cloudflare's Cache API doesn't support listing/purging by prefix
  // For proper invalidation, you'd need to:
  // 1. Track cache keys in KV
  // 2. Use Cloudflare's Purge API with zone ID
  // This is a placeholder for future implementation
  console.log('[Cache] Purge requested for prefix:', prefix)
}
