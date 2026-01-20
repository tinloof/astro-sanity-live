/// <reference types="astro/client" />

import {
  type ClientConfig,
  createClient as sanityCreateClient,
  type SanityClient,
  type QueryParams,
} from '@sanity/client'
import { setConfig, addTags, resetTags } from './config'
import { LIVE_EVENT_COOKIE, VISUAL_EDITING_ENABLED, DEFAULT_API_VERSION } from './constants'

export type StegaConfig = {
  /**
   * The URL to the Sanity Studio (e.g., '/cms' or 'https://my-studio.sanity.studio')
   * @default '/cms'
   */
  studioUrl?: string
}

export type InitSanityConfig = {
  client?: Omit<ClientConfig, 'projectId' | 'dataset'>
  /**
   * Stega configuration for visual editing.
   * Stega is automatically enabled when in visual editing mode.
   */
  stega?: StegaConfig
}

export type SanityConfig = {
  projectId: string
  dataset: string
  apiVersion: string
  useCdn?: boolean
}

type AstroGlobal = {
  cookies: {
    get: (name: string) => { value: string } | undefined
    delete: (name: string) => void
    set: (name: string, value: string, options?: { path?: string }) => void
  }
  url: URL
}

export type SanityFetchOptions = {
  query: string
  params?: QueryParams
}

export type SanityFetchResult<T> = {
  data: T
  sourceMap?: unknown
  perspective: 'published' | 'drafts'
}

type InitSanityReturn = {
  client: SanityClient
  config: SanityConfig
  /**
   * Fetch content from Sanity with visual editing support.
   * Automatically switches perspective and enables stega when in visual editing mode.
   */
  sanityFetch: <T>(
    Astro: AstroGlobal,
    options: SanityFetchOptions
  ) => Promise<SanityFetchResult<T>>
}

/**
 * Initializes Sanity client and utilities for Astro.
 * Reads from PUBLIC_SANITY_PROJECT_ID and PUBLIC_SANITY_DATASET environment variables.
 */
export function initSanity(config?: InitSanityConfig): InitSanityReturn {
  const projectId = import.meta.env.PUBLIC_SANITY_PROJECT_ID
  const dataset = import.meta.env.PUBLIC_SANITY_DATASET
  const apiVersion = import.meta.env.PUBLIC_SANITY_API_VERSION

  if (!projectId) {
    throw new Error(
      'PUBLIC_SANITY_PROJECT_ID environment variable is not defined. ' +
        'Add it to your .env file or astro.config.mjs env schema.'
    )
  }

  if (!dataset) {
    throw new Error(
      'PUBLIC_SANITY_DATASET environment variable is not defined. ' +
        'Add it to your .env file or astro.config.mjs env schema.'
    )
  }

  const sanityConfig: SanityConfig = {
    projectId,
    dataset,
    apiVersion: apiVersion || DEFAULT_API_VERSION,
    useCdn: true,
  }

  const stegaStudioUrl = config?.stega?.studioUrl || '/cms'

  // Token for draft access (server-side only, not PUBLIC_)
  const token = import.meta.env.SANITY_API_READ_TOKEN

  // Regular client without stega
  const client = sanityCreateClient({
    ...sanityConfig,
    ...config?.client,
  })

  // Client with stega and token for visual editing (draft access)
  const stegaClient = sanityCreateClient({
    ...sanityConfig,
    ...config?.client,
    token,
    useCdn: false, // Can't use CDN with token/drafts
    stega: {
      enabled: true,
      studioUrl: stegaStudioUrl,
    },
  })

  /**
   * Check if visual editing is enabled for this request.
   * Also handles enabling visual editing via URL parameter.
   */
  function isVisualEditingEnabled(Astro: AstroGlobal): boolean {
    // Check for URL parameter to enable visual editing
    if (Astro.url.searchParams.has(VISUAL_EDITING_ENABLED)) {
      // Set cookie so subsequent navigations stay in visual editing mode
      Astro.cookies.set(VISUAL_EDITING_ENABLED, 'true', { path: '/' })
      return true
    }

    // Check for existing visual editing cookie
    const cookie = Astro.cookies.get(VISUAL_EDITING_ENABLED)
    return cookie?.value === 'true'
  }

  async function sanityFetch<T>(
    Astro: AstroGlobal,
    { query, params = {} }: SanityFetchOptions
  ): Promise<SanityFetchResult<T>> {
    let lastLiveEventId: string | undefined
    const liveCookie = Astro.cookies.get(LIVE_EVENT_COOKIE)

    if (liveCookie) {
      lastLiveEventId = liveCookie.value
      Astro.cookies.delete(LIVE_EVENT_COOKIE)
      resetTags()
    }

    const visualEditing = isVisualEditingEnabled(Astro)
    // Only use drafts perspective if we have a token
    const perspective = visualEditing && token ? 'drafts' : 'published'
    const activeClient = visualEditing ? stegaClient : client

    console.log('[sanityFetch] Request:', {
      visualEditing,
      hasToken: !!token,
      tokenPreview: token ? token.slice(0, 10) + '...' : 'none',
      perspective,
      lastLiveEventId,
      useCdn: !visualEditing,
      query: query.slice(0, 100) + (query.length > 100 ? '...' : ''),
    })

    const { result, syncTags = [], resultSourceMap } = await activeClient.fetch(
      query,
      params,
      {
        lastLiveEventId,
        filterResponse: false,
        perspective,
        // Bypass CDN when fetching drafts
        useCdn: !visualEditing,
        resultSourceMap: visualEditing ? 'withKeyArraySelector' : false,
        // Disable caching for draft content
        ...(visualEditing && { cache: 'no-store' }),
      }
    )

    console.log('[sanityFetch] Response:', {
      perspective,
      syncTagsCount: syncTags.length,
      hasSourceMap: !!resultSourceMap,
      timestamp: new Date().toISOString(),
      resultPreview: JSON.stringify(result).slice(0, 300) + '...',
    })

    addTags(syncTags)

    return {
      data: result as T,
      sourceMap: resultSourceMap,
      perspective,
    }
  }

  setConfig(sanityConfig)

  return { client, config: sanityConfig, sanityFetch }
}

export { type SanityClient, type QueryParams }
