'use client'

import type { SanityClient } from '@sanity/client'
import { useQuery, useLiveMode } from './loader'
import { VISUAL_EDITING_ENABLED } from './constants'

export type UseSanityLiveModeOptions = {
  /** Browser client for live mode */
  client?: SanityClient
}

/**
 * Check if visual editing is enabled (client-side).
 * Checks both URL parameter and cookie because third-party cookies
 * may be blocked when loaded in Sanity's Presentation tool iframe.
 */
function isVisualEditingEnabled(): boolean {
  if (typeof window === 'undefined') return false

  // Check URL parameter first (works even when cookies are blocked)
  const urlParams = new URLSearchParams(window.location.search)
  if (urlParams.has(VISUAL_EDITING_ENABLED)) {
    return true
  }

  // Fall back to cookie check
  return document.cookie.includes(`${VISUAL_EDITING_ENABLED}=true`)
}

/**
 * Hook to enable live mode when in visual editing.
 * Call this once in your layout (typically via SanityLive.astro).
 */
export function useSanityLiveMode({ client }: UseSanityLiveModeOptions = {}) {
  const enabled = isVisualEditingEnabled()

  // Enable live mode when we have a client and visual editing is active
  useLiveMode({
    client: enabled ? client : undefined,
    allowStudioOrigin: true,
  })

  return { enabled }
}

// Re-export useQuery for components to use directly
export { useQuery, useLiveMode } from './loader'
