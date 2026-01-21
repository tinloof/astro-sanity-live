import { enableVisualEditing, type HistoryRefresh } from '@sanity/visual-editing'
import { useEffect, useState, useRef, useCallback } from 'react'
import { VISUAL_EDITING_ENABLED } from '../constants'

export type VisualEditingComponentProps = {
  /**
   * The z-index for the visual editing overlays
   * @default 9999
   */
  zIndex?: number
  /**
   * Debounce delay in ms before refreshing after mutations stop
   * @default 300
   */
  refreshDebounce?: number
}

/**
 * Check if we're inside an iframe (likely Presentation tool)
 */
function isInIframe(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.self !== window.top
  } catch {
    // If accessing window.top throws (cross-origin), we're in an iframe
    return true
  }
}

/**
 * Check if visual editing cookie is set
 */
function hasVisualEditingCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.includes(`${VISUAL_EDITING_ENABLED}=true`)
}

/**
 * Set the visual editing cookie
 */
function setVisualEditingCookie(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${VISUAL_EDITING_ENABLED}=true; path=/; max-age=86400`
}

/**
 * Clear the visual editing cookie
 */
function clearVisualEditingCookie(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${VISUAL_EDITING_ENABLED}=; path=/; max-age=0`
}

/**
 * Clean Sanity-related params from URL
 */
function cleanUrlParams(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete(VISUAL_EDITING_ENABLED)
  url.searchParams.delete('sanity-preview-perspective')
  window.history.replaceState({}, '', url.toString())
}

/**
 * Determine if visual editing should be enabled.
 * Returns: { enabled: boolean, needsRefresh: boolean }
 * - enabled: whether visual editing mode is active
 * - needsRefresh: whether we just set the cookie and need to refresh for stega
 */
function checkVisualEditingState(): { enabled: boolean; needsRefresh: boolean } {
  if (typeof window === 'undefined') return { enabled: false, needsRefresh: false }

  // If in iframe (Presentation tool), enable and ensure cookie is set
  if (isInIframe()) {
    const hadCookie = hasVisualEditingCookie()
    if (!hadCookie) {
      setVisualEditingCookie()
      // Need to refresh so server returns stega-encoded content
      return { enabled: true, needsRefresh: true }
    }
    return { enabled: true, needsRefresh: false }
  }

  // If not in iframe, check cookie (allows direct access if cookie was set)
  return { enabled: hasVisualEditingCookie(), needsRefresh: false }
}

/**
 * Trigger a soft page refresh using View Transitions
 */
function triggerViewTransitionRefresh(): void {
  // Dispatch custom event that Astro script will handle
  window.dispatchEvent(new CustomEvent('sanity:visual-editing-refresh'))
}

/**
 * React component that enables Sanity Visual Editing.
 * Automatically detects when inside Sanity's Presentation tool iframe.
 * Shows an exit button when visual editing is active (only outside iframe).
 */
export default function VisualEditingComponent({
  zIndex = 9999,
  refreshDebounce = 300,
}: VisualEditingComponentProps) {
  const [isEnabled, setIsEnabled] = useState(false)
  const [isIframe, setIsIframe] = useState(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const hasRefreshedRef = useRef(false)

  // Check state function that can be called on mount and navigation
  const checkState = useCallback(() => {
    const iframe = isInIframe()
    const { enabled, needsRefresh } = checkVisualEditingState()
    setIsIframe(iframe)
    setIsEnabled(enabled)

    // If we just set the cookie, refresh to get stega-encoded content
    // Only do this once to avoid infinite refresh loops
    if (needsRefresh && !hasRefreshedRef.current) {
      hasRefreshedRef.current = true
      // Small delay to ensure cookie is set before refresh
      setTimeout(() => {
        triggerViewTransitionRefresh()
      }, 50)
    }

    return enabled
  }, [])

  // Initial check and navigation listener
  useEffect(() => {
    // Check on mount
    checkState()

    // Re-check after Astro View Transitions navigation
    const handlePageLoad = () => {
      checkState()
    }

    // Astro fires this event after View Transitions complete
    document.addEventListener('astro:page-load', handlePageLoad)

    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad)
    }
  }, [checkState])

  // Enable visual editing when state changes
  useEffect(() => {
    if (!isEnabled) {
      // Clean up any existing instance
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
      return
    }

    // Refresh handler using View Transitions
    const handleRefresh = (payload: HistoryRefresh): Promise<void> => {
      return new Promise((resolve) => {
        // Manual refresh (user clicked button) - refresh immediately
        if (payload.source === 'manual') {
          triggerViewTransitionRefresh()
          resolve()
          return
        }

        // Mutation refresh - debounce to wait for typing to stop
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
        }

        debounceTimerRef.current = setTimeout(() => {
          triggerViewTransitionRefresh()
        }, refreshDebounce)

        // Resolve immediately so Presentation tool doesn't show loading forever
        resolve()
      })
    }

    // Enable visual editing overlays
    cleanupRef.current = enableVisualEditing({
      zIndex,
      refresh: handleRefresh,
    })

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
    }
  }, [zIndex, refreshDebounce, isEnabled])

  // Don't render anything if not enabled
  if (!isEnabled) return null

  // Don't show exit button when in iframe (Presentation tool has its own UI)
  if (isIframe) return null

  // Show exit button only when accessing directly with cookie
  return (
    <button
      onClick={() => {
        clearVisualEditingCookie()
        cleanUrlParams()
        window.location.reload()
      }}
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        zIndex: zIndex + 1,
        padding: '8px 16px',
        backgroundColor: '#1a1a1a',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        fontSize: '14px',
        fontFamily: 'system-ui, sans-serif',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      Exit Visual Editing
    </button>
  )
}
