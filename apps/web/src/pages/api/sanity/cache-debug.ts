import type { APIRoute } from 'astro'
import { getCacheDebugInfo } from '@tinloof/sanity-astro/cache'

export const GET: APIRoute = async () => {
  const debugInfo = await getCacheDebugInfo()

  return new Response(JSON.stringify(debugInfo, null, 2), {
    headers: { 'content-type': 'application/json' },
  })
}
