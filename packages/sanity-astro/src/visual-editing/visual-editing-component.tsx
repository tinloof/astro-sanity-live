import { enableVisualEditing, type HistoryRefresh } from '@sanity/visual-editing'
import { createClient, type SanityClient } from '@sanity/client'
import { useEffect, useState, useRef, useMemo } from 'react'
import { VISUAL_EDITING_ENABLED } from '../constants'
import { useLiveMode } from '../loader'

export type SanityConfig = {
  projectId: string
  dataset: string
  apiVersion: string
  studioUrl: string
}

export type VisualEditingComponentProps = {
  /**
   * The z-index for the visual editing overlays
   * @default 9999
   */
  zIndex?: number
  /**
   * The refresh strategy when content changes in the Studio
   * - 'live': Real-time updates via loaders (no page reload) - RECOMMENDED
   * - 'reload': Page reload with debouncing
   * - 'manual': No automatic refresh
   * @default 'live'
   */
  refresh?: 'live' | 'reload' | 'manual'
  /**
   * Debounce delay in ms before refreshing after mutations stop (only for 'reload' mode)
   * @default 500
   */
  refreshDebounce?: number
  /**
   * Sanity config for creating the browser client (for live mode)
   */
  config?: SanityConfig
}

/**
 * Check if visual editing cookie is set (synchronous check)
 */
function hasVisualEditingCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.includes(`${VISUAL_EDITING_ENABLED}=true`)
}

/**
 * Get initial visual editing state (for SSR-safe initialization)
 */
function getInitialVisualEditingState(): boolean {
  if (typeof document === 'undefined') return false
  return hasVisualEditingCookie()
}

/**
 * Clear the visual editing cookie
 */
function clearVisualEditingCookie(): void {
  document.cookie = `${VISUAL_EDITING_ENABLED}=; path=/; max-age=0`
}

/**
 * Separate component that enables live mode.
 * This allows us to conditionally render it (avoiding the hook when not needed).
 */
function LiveModeEnabler({ client }: { client: SanityClient }) {
  useLiveMode({ client })
  return null
}

/**
 * React component that enables Sanity Visual Editing.
 * Shows an exit button when visual editing is active.
 */
export default function VisualEditingComponent({
  zIndex = 9999,
  refresh = 'live',
  refreshDebounce = 500,
  config,
}: VisualEditingComponentProps) {
  // Use lazy initialization to check cookie synchronously on first render
  const [isEnabled, setIsEnabled] = useState(getInitialVisualEditingState)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isReloadingRef = useRef(false)

  // Create browser client for live mode (only when enabled and config exists)
  const browserClient = useMemo(() => {
    if (!isEnabled || !config) return null
    return createClient({
      projectId: config.projectId,
      dataset: config.dataset,
      apiVersion: config.apiVersion,
      useCdn: false,
      stega: {
        enabled: true,
        studioUrl: config.studioUrl,
      },
    })
  }, [isEnabled, config])

  // Determine if we should enable live mode
  const shouldEnableLiveMode = isEnabled && refresh === 'live' && browserClient

  useEffect(() => {
    console.log('[VisualEditing] Debug:', {
      isEnabled,
      isInIframe: window.self !== window.top,
      url: window.location.href,
      refreshMode: refresh,
      hasConfig: !!config,
      hasBrowserClient: !!browserClient,
    })

    if (!isEnabled) {
      console.log('[VisualEditing] Not enabled, skipping setup')
      return
    }

    console.log('[VisualEditing] Enabling visual editing overlays...', { refresh })

    // Debounced refresh handler for 'reload' mode
    const handleRefresh = (payload: HistoryRefresh): false | Promise<void> => {
      // In live mode, let the loaders handle updates - return false for default behavior
      if (refresh === 'live') {
        console.log('[VisualEditing] Live mode - loaders handling update')
        return false // Use default behavior (loaders handle it)
      }

      return new Promise((resolve) => {
        // If already reloading, don't queue more reloads
        if (isReloadingRef.current) {
          console.log('[VisualEditing] Already reloading, ignoring refresh')
          resolve()
          return
        }

        // Manual refresh (user clicked button) - reload immediately
        if (payload.source === 'manual') {
          console.log('[VisualEditing] Manual refresh triggered, reloading...')
          isReloadingRef.current = true
          window.location.reload()
          return // Don't resolve, page is reloading
        }

        // Mutation refresh - debounce to wait for typing to stop
        console.log('[VisualEditing] Mutation detected, debouncing refresh...', {
          documentType: payload.document?._type,
          documentId: payload.document?._id,
        })

        // Clear any existing timer
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
        }

        // Set new timer - will reload after debounce period if no new mutations
        debounceTimerRef.current = setTimeout(() => {
          console.log('[VisualEditing] Debounce complete, reloading page...')
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

    console.log('[VisualEditing] Visual editing enabled successfully')

    return () => {
      console.log('[VisualEditing] Cleaning up...')
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      cleanup()
    }
  }, [zIndex, refresh, refreshDebounce, browserClient, isEnabled, config])

  if (!isEnabled) return null

  return (
    <>
      {/* Enable live mode only when needed - renders nothing but enables the subscription */}
      {shouldEnableLiveMode && browserClient && (
        <LiveModeEnabler client={browserClient} />
      )}
      <button
        onClick={() => {
          clearVisualEditingCookie()
          window.location.reload()
        }}
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
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
    </>
  )
}
