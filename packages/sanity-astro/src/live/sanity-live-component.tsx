import { useEffect, useRef } from 'react'
import { createClient } from '@sanity/client'
import type { PurgeResponse } from './purge-handler'

const LAST_LIVE_EVENT_ID_COOKIE = 'sanity-live-event-id'
const VISUAL_EDITING_COOKIE = 'sanity-visual-editing'

function isVisualEditingActive(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.includes(`${VISUAL_EDITING_COOKIE}=true`)
}

export type SanityLiveProps = {
  projectId: string
  dataset: string
  apiVersion: string
  refreshOnPurge: boolean
  refreshDebounce: number
  purgeEndpoint: string
}

function softRefresh() {
  window.dispatchEvent(new CustomEvent('sanity:refresh'))
}

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

    const client = createClient({
      projectId,
      dataset,
      apiVersion,
      useCdn: false,
    })

    const subscription = client.live.events().subscribe({
      next: async (event) => {
        // Skip events during mount grace period to avoid unnecessary refreshes
        if (Date.now() - mountTimeRef.current < MOUNT_GRACE_PERIOD) {
          return
        }

        if (event.type === 'message' && event.tags && event.tags.length > 0) {
          const eventId = event.id

          try {
            const response = await fetch(purgeEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tags: event.tags, eventId }),
            })

            if (!response.ok) {
              console.error('[SanityLive] Purge request failed:', response.status)
              return
            }

            const result = await response.json() as PurgeResponse

            // Set cookie so the next page load uses lastLiveEventId
            // This ensures Sanity CDN serves fresh content
            if (eventId) {
              document.cookie = `${LAST_LIVE_EVENT_ID_COOKIE}=${encodeURIComponent(eventId)}; path=/; max-age=60`
            }

            // Determine if we should refresh
            // Refresh if either query cache or page cache had entries purged
            const hadPurgedContent =
              (result.purgedQueryKeys?.length > 0) ||
              (result.purgedPageUrls?.length > 0) ||
              // Backward compatibility
              (result.purgedKeys?.length > 0)

            if (refreshOnPurge && hadPurgedContent && !isVisualEditingActive()) {
              // Debounce refreshes to avoid rapid-fire updates
              if (refreshTimeoutRef.current) {
                window.clearTimeout(refreshTimeoutRef.current)
              }

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

    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current)
      }
      subscription.unsubscribe()
    }
  }, [projectId, dataset, apiVersion, refreshOnPurge, refreshDebounce, purgeEndpoint])

  return null
}
