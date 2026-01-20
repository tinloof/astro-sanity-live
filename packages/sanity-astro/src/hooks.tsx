'use client'

import { type QueryResponseInitial } from '@sanity/react-loader'
import type { QueryParams, SanityClient } from '@sanity/client'
import { useQuery, useLiveMode } from './loader'
import { VISUAL_EDITING_ENABLED } from './constants'

export type UseSanityDataOptions<T> = {
  /** The GROQ query */
  query: string
  /** Query parameters */
  params?: QueryParams
  /** Initial data from server-side loadQuery */
  initial: {
    data: T
    sourceMap: unknown
  }
}

export type UseSanityDataResult<T> = {
  /** The data - live in visual editing mode, static otherwise */
  data: T
  /** Loading state */
  loading: boolean
  /** Error if any */
  error: Error | null
  /** Encode data attribute for visual editing overlays */
  encodeDataAttribute?: (path: string | string[]) => string
}

/**
 * Check if visual editing is enabled (client-side)
 */
function isVisualEditingEnabled(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.includes(`${VISUAL_EDITING_ENABLED}=true`)
}

/**
 * Hook for fetching Sanity data with live updates in visual editing mode.
 * Uses the same query store as useLiveMode for real-time updates.
 *
 * Usage:
 * ```tsx
 * // In your Astro page:
 * const result = await loadQuery(Astro, { query: '*[_type == "post"]' })
 *
 * // Pass to React island:
 * <PostList client:load {...result} />
 *
 * // In your React component:
 * function PostList({ query, params, initial }) {
 *   const { data } = useSanityData({ query, params, initial })
 *   return <ul>{data.map(post => <li key={post._id}>{post.title}</li>)}</ul>
 * }
 * ```
 */
export function useSanityData<T>({
  query,
  params = {},
  initial,
}: UseSanityDataOptions<T>): UseSanityDataResult<T> {
  // Use the shared query store's useQuery hook
  // This returns initial data in production, and live data when useLiveMode is active
  const result = useQuery<T>(query, params, {
    initial: initial as QueryResponseInitial<T>,
  })

  return {
    data: result.data ?? initial.data,
    loading: result.loading ?? false,
    error: result.error ?? null,
    encodeDataAttribute: result.encodeDataAttribute,
  }
}

export type UseSanityLiveModeOptions = {
  /** Browser client for live mode */
  client?: SanityClient
}

/**
 * Hook to enable live mode when in visual editing.
 * Call this once in your visual editing component or layout.
 * Uses the same query store as useSanityData for shared state.
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

// Re-export for convenience
export { useQuery, useLiveMode } from './loader'
