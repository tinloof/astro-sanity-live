import type { APIRoute } from 'astro'
import { createPurgeHandler } from '@tinloof/sanity-astro/live'
import { getCacheDebugInfo } from '@tinloof/sanity-astro/cache'

export const POST: APIRoute = async (context) => {
  // Log incoming tags
  const body = await context.request.clone().json()
  console.log('[Purge] Incoming tags:', body.tags)

  // Log cache state before purge
  const beforeInfo = await getCacheDebugInfo()
  console.log('[Purge] Tag index before:', beforeInfo.tagIndex)

  // Run the purge handler
  const handler = createPurgeHandler()
  const response = await handler(context)

  // Log result
  const result = await response.clone().json()
  console.log('[Purge] Result:', result)

  return response
}
