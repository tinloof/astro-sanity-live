/**
 * Purge API route for Sanity cache invalidation.
 *
 * This route is automatically injected by the @tinloof/sanity-astro integration.
 * It handles POST requests from the SanityLive component to purge cache entries
 * when content changes are detected via Sanity's live events.
 */
import type { APIRoute } from 'astro'
import { createPurgeHandler } from './purge-handler'

export const prerender = false

export const POST: APIRoute = createPurgeHandler()
