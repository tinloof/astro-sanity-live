import { purgeCacheByTags, type PurgeCacheResult } from '../cache'

export type PurgeRequest = {
  tags: string[]
  eventId?: string
}

export type PurgeResponse = {
  success: boolean
  /** @deprecated Use purgedQueryKeys instead */
  purgedKeys: string[]
  /** Query cache keys that were purged */
  purgedQueryKeys: string[]
  /** Page URLs that were purged from CDN cache */
  purgedPageUrls: string[]
  /** Tags that had associated cache entries */
  purgedTags: string[]
  eventId?: string
  error?: string
}

const JSON_HEADERS = { 'content-type': 'application/json' } as const

function jsonResponse(body: PurgeResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  })
}

/**
 * Creates a purge handler that clears both query cache and page cache entries
 * based on Sanity sync tags.
 *
 * When content changes in Sanity:
 * 1. SanityLive component receives the event with tags
 * 2. SanityLive calls this purge endpoint with those tags
 * 3. This handler clears:
 *    - Query cache entries (individual Sanity query results)
 *    - Page cache entries (full HTML pages that used those queries)
 * 4. SanityLive sets a cookie and triggers page refresh
 * 5. On refresh, the page is re-rendered with fresh data
 */
export function createPurgeHandler() {
  return async ({ request }: { request: Request }): Promise<Response> => {
    // Only allow POST requests
    if (request.method !== 'POST') {
      return jsonResponse(
        {
          success: false,
          purgedKeys: [],
          purgedQueryKeys: [],
          purgedPageUrls: [],
          purgedTags: [],
          error: 'Method not allowed. Use POST.',
        },
        405
      )
    }

    try {
      const body = await request.json() as PurgeRequest

      if (!body.tags || !Array.isArray(body.tags)) {
        return jsonResponse(
          {
            success: false,
            purgedKeys: [],
            purgedQueryKeys: [],
            purgedPageUrls: [],
            purgedTags: [],
            error: 'Missing or invalid tags array',
          },
          400
        )
      }

      // Filter out empty tags
      const tags = body.tags.filter(tag => typeof tag === 'string' && tag.length > 0)

      if (tags.length === 0) {
        return jsonResponse(
          {
            success: true,
            purgedKeys: [],
            purgedQueryKeys: [],
            purgedPageUrls: [],
            purgedTags: [],
            eventId: body.eventId,
          },
          200
        )
      }

      // Purge both query cache and page cache
      const result = await purgeCacheByTags(tags)

      return jsonResponse(
        {
          success: true,
          // Backward compatibility: purgedKeys maps to purgedQueryKeys
          purgedKeys: result.purgedQueryKeys,
          purgedQueryKeys: result.purgedQueryKeys,
          purgedPageUrls: result.purgedPageUrls,
          purgedTags: result.purgedTags,
          eventId: body.eventId,
        },
        200
      )
    } catch (err) {
      return jsonResponse(
        {
          success: false,
          purgedKeys: [],
          purgedQueryKeys: [],
          purgedPageUrls: [],
          purgedTags: [],
          error: err instanceof Error ? err.message : 'Unknown error',
        },
        500
      )
    }
  }
}
