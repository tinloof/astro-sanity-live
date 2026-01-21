import { purgeCacheByTags } from '../cache'

/**
 * Request body for purge endpoint
 */
export type PurgeRequest = {
  tags: string[]
  /** Event ID from Sanity live event - used to get fresh data from CDN */
  eventId?: string
}

/**
 * Response from purge endpoint
 */
export type PurgeResponse = {
  success: boolean
  purgedKeys: string[]
  purgedTags: string[]
  /** Event ID echoed back for client to use */
  eventId?: string
  error?: string
}

const JSON_HEADERS = { 'content-type': 'application/json' } as const

function jsonResponse(body: PurgeResponse, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/**
 * Create a purge handler for Astro API routes.
 *
 * This handler should be used in an Astro API route to enable
 * cache invalidation from SanityLive events.
 *
 * @example
 * ```ts
 * // src/pages/api/sanity/purge.ts
 * import type { APIRoute } from 'astro'
 * import { createPurgeHandler } from '@tinloof/sanity-astro/live'
 *
 * export const POST: APIRoute = createPurgeHandler()
 * ```
 */
export function createPurgeHandler() {
  return async ({ request }: { request: Request }): Promise<Response> => {
    try {
      const body = await request.json() as PurgeRequest

      if (!body.tags || !Array.isArray(body.tags)) {
        return jsonResponse(
          { success: false, purgedKeys: [], purgedTags: [], error: 'Missing or invalid tags array' },
          400
        )
      }

      const { purgedKeys, purgedTags } = await purgeCacheByTags(body.tags)

      // Echo back the event ID so client can use it for next request
      return jsonResponse({
        success: true,
        purgedKeys,
        purgedTags,
        eventId: body.eventId,
      }, 200)
    } catch (err) {
      return jsonResponse(
        {
          success: false,
          purgedKeys: [],
          purgedTags: [],
          error: err instanceof Error ? err.message : 'Unknown error',
        },
        500
      )
    }
  }
}
