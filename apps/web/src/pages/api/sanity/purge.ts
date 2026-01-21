import type { APIRoute } from 'astro'
import { createPurgeHandler } from '@tinloof/sanity-astro/live'

export const POST: APIRoute = createPurgeHandler()
