export const VISUAL_EDITING_ENABLED = 'sanity-visual-editing'
export const DEFAULT_API_VERSION = '2025-10-01'

// Fake URL used as cache key namespace for Cloudflare Cache API
export const CACHE_INTERNAL_URL = 'https://cache.internal'

// Default values for SanityLive component
export const DEFAULT_PURGE_ENDPOINT = '/api/sanity/purge'
export const DEFAULT_REFRESH_DEBOUNCE = 100

// Cookie name for Sanity's lastLiveEventId (used to get fresh data from CDN after purge)
export const LAST_LIVE_EVENT_ID_COOKIE = 'sanity-live-event-id'

// Query cache defaults - with tag-based invalidation, we can cache aggressively
// Tags handle freshness, these are just safety nets
export const DEFAULT_CACHE_MAX_AGE = 60 * 60 * 24 // 1 day
export const DEFAULT_CACHE_SWR = 60 * 60 * 24 * 7 // 1 week
export const DEFAULT_CACHE_KEY_PREFIX = 'sanity'

// Page cache defaults - shorter durations since these are full HTML responses
// These control CDN-Cache-Control headers for edge caching
export const DEFAULT_PAGE_CACHE_MAX_AGE = 60 * 60 // 1 hour
export const DEFAULT_PAGE_CACHE_SWR = 60 * 60 * 24 // 1 day
export const DEFAULT_BROWSER_CACHE_MAX_AGE = 60 // 1 minute (browser cache)

// Page index key for tracking page URLs by tags
export const PAGE_INDEX_KEY = '__page_index__'

// Routes that should never have page caching headers set
// Note: These don't need explicit exclusion since they don't call loadQuery()
// But we check them as a safety measure
export const NO_CACHE_ROUTE_PREFIXES = [
  '/api/',
  '/cms/',
  '/_astro/',
]
