import { useEffect, useRef } from 'react'
import { createClient } from '@sanity/client'
import type { PurgeResponse } from './purge-handler'

// Cookie names must match the constants in constants.ts
const LAST_LIVE_EVENT_ID_COOKIE = 'sanity-live-event-id'
const VISUAL_EDITING_COOKIE = 'sanity-visual-editing'

/**
 * Check if visual editing mode is active (in Presentation tool)
 */
function isVisualEditingActive(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.includes(`${VISUAL_EDITING_COOKIE}=true`)
}

export type SanityLiveProps = {
  /**
   * Sanity project ID
   */
  projectId: string
  /**
   * Sanity dataset
   */
  dataset: string
  /**
   * API version
   */
  apiVersion: string
  /**
   * Whether to refresh the page after cache purge
   */
  refreshOnPurge: boolean
  /**
   * Debounce delay before refreshing (ms)
   */
  refreshDebounce: number
  /**
   * API endpoint for cache purge
   */
  purgeEndpoint: string
}

/**
 * SanityLive component subscribes to Sanity's live events
 * and purges the Cloudflare cache when content changes.
 *
 * This component should be included in your layout to enable
 * real-time cache invalidation.
 */
/**
 * Trigger page refresh via custom event (handled by Astro script)
 */
function softRefresh() {
  window.dispatchEvent(new CustomEvent('sanity:refresh'))
}

// Time to wait after mount before processing events (prevents initial refresh)
const MOUNT_GRACE_PERIOD = 1000

export default function SanityLive({
  projectId,
  dataset,
  apiVersion,
  refreshOnPurge,
  refreshDebounce,
  purgeEndpoint,
}: SanityLiveProps) {
  const refreshTimeoutRef = useRef<number | null>(null)
  const mountTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    mountTimeRef.current = Date.now()

    // Create Sanity client for live events
    const client = createClient({
      projectId,
      dataset,
      apiVersion,
      useCdn: false,
    })

    // Subscribe to live events
    const subscription = client.live.events().subscribe({
      next: async (event) => {
        // Skip events that arrive too soon after mount (initial sync)
        if (Date.now() - mountTimeRef.current < MOUNT_GRACE_PERIOD) {
          return
        }

        // Only handle events that have tags
        if (event.type === 'message' && event.tags && event.tags.length > 0) {
          // Extract event ID - this tells Sanity's CDN to return fresh data
          const eventId = event.id

          try {
            // Call purge API with tags and event ID
            const response = await fetch(purgeEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tags: event.tags, eventId }),
            })

            if (!response.ok) {
              return
            }

            const result = await response.json() as PurgeResponse

            // Store the event ID in a cookie for fresh CDN data on next request
            if (eventId) {
              document.cookie = `${LAST_LIVE_EVENT_ID_COOKIE}=${encodeURIComponent(eventId)}; path=/; max-age=60`
            }

            // Refresh the page if enabled and cache was actually purged
            // Skip if visual editing is active (VisualEditing component handles refresh)
            if (refreshOnPurge && result.purgedKeys?.length > 0 && !isVisualEditingActive()) {
              // Clear any pending refresh
              if (refreshTimeoutRef.current) {
                window.clearTimeout(refreshTimeoutRef.current)
              }

              // Debounce the refresh
              refreshTimeoutRef.current = window.setTimeout(() => {
                softRefresh()
              }, refreshDebounce)
            }
          } catch (err) {
            console.error('[SanityLive] Purge error:', err)
          }
        }
      },
    })

    // Cleanup
    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current)
      }
      subscription.unsubscribe()
    }
  }, [projectId, dataset, apiVersion, refreshOnPurge, refreshDebounce, purgeEndpoint])

  // This component doesn't render anything
  return null
}
