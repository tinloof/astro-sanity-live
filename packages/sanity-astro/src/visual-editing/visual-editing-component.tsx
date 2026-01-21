import { enableVisualEditing, type HistoryRefresh } from '@sanity/visual-editing'
import { useEffect, useState, useRef } from 'react'
import { VISUAL_EDITING_ENABLED } from '../constants'

export type VisualEditingComponentProps = {
  /**
   * The z-index for the visual editing overlays
   * @default 9999
   */
  zIndex?: number
  /**
   * The refresh strategy when content changes in the Studio
   * - 'reload': Page reload with debouncing (default)
   * - 'manual': No automatic refresh
   * @default 'reload'
   */
  refresh?: 'reload' | 'manual'
  /**
   * Debounce delay in ms before refreshing after mutations stop
   * @default 500
   */
  refreshDebounce?: number
}

/**
 * Check if visual editing is enabled via cookie OR URL parameter.
 * URL parameter check is needed because third-party cookies may be blocked
 * when the site is loaded in Sanity's Presentation tool iframe.
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
 * Get initial visual editing state (for SSR-safe initialization)
 */
function getInitialVisualEditingState(): boolean {
  if (typeof window === 'undefined') return false
  return isVisualEditingEnabled()
}

/**
 * Clear the visual editing cookie
 */
function clearVisualEditingCookie(): void {
  document.cookie = `${VISUAL_EDITING_ENABLED}=; path=/; max-age=0`
}

/**
 * React component that enables Sanity Visual Editing.
 * Shows an exit button when visual editing is active.
 */
export default function VisualEditingComponent({
  zIndex = 9999,
  refresh = 'reload',
  refreshDebounce = 500,
}: VisualEditingComponentProps) {
  // Use lazy initialization to check cookie/URL synchronously on first render
  const [isEnabled, setIsEnabled] = useState(getInitialVisualEditingState)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isReloadingRef = useRef(false)

  useEffect(() => {
    if (!isEnabled) {
      return
    }

    // Debounced refresh handler for 'reload' mode
    const handleRefresh = (payload: HistoryRefresh): false | Promise<void> => {
      return new Promise((resolve) => {
        // If already reloading, don't queue more reloads
        if (isReloadingRef.current) {
          resolve()
          return
        }

        // Manual refresh (user clicked button) - reload immediately
        if (payload.source === 'manual') {
          isReloadingRef.current = true
          window.location.reload()
          return // Don't resolve, page is reloading
        }

        // Mutation refresh - debounce to wait for typing to stop
        // Clear any existing timer
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
        }

        // Set new timer - will reload after debounce period if no new mutations
        debounceTimerRef.current = setTimeout(() => {
          isReloadingRef.current = true
          window.location.reload()
        }, refreshDebounce)

        // Resolve immediately so the Presentation tool doesn't show loading forever
        resolve()
      })
    }

    const cleanup = enableVisualEditing({
      zIndex,
      refresh: refresh !== 'manual' ? handleRefresh : undefined,
    })

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      cleanup()
    }
  }, [zIndex, refresh, refreshDebounce, isEnabled])

  if (!isEnabled) return null

  return (
    <button
      onClick={() => {
        clearVisualEditingCookie()
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
