export const VISUAL_EDITING_ENABLED = 'sanity-visual-editing'
export const DEFAULT_API_VERSION = '2025-10-01'

// Fake URL used as cache key namespace for Cloudflare Cache API
export const CACHE_INTERNAL_URL = 'https://cache.internal'

// Default values for SanityLive component
export const DEFAULT_PURGE_ENDPOINT = '/api/sanity/purge'
export const DEFAULT_REFRESH_DEBOUNCE = 100

// Cookie name for Sanity's lastLiveEventId (used to get fresh data from CDN after purge)
export const LAST_LIVE_EVENT_ID_COOKIE = 'sanity-live-event-id'
