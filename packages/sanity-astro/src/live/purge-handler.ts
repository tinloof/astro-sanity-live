import { purgeCacheByTags } from '../cache'

/**
 * Request body for purge endpoint
 */
export type PurgeRequest = {
  tags: string[]
}

/**
 * Response from purge endpoint
 */
export type PurgeResponse = {
  success: boolean
  purgedKeys: string[]
  purgedTags: string[]
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

      return jsonResponse({ success: true, purgedKeys, purgedTags }, 200)
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
