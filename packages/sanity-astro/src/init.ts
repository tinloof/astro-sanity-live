/// <reference types="astro/client" />

import {
  type ClientConfig,
  createClient as sanityCreateClient,
  type SanityClient,
  type QueryParams,
} from '@sanity/client'
import { setConfig, addTags, resetTags } from './config'
import { LIVE_EVENT_COOKIE, DEFAULT_API_VERSION } from './constants'

export type InitSanityConfig = {
  client?: Omit<ClientConfig, 'projectId' | 'dataset'>
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
  }
}

type InitSanityReturn = {
  client: SanityClient
  config: SanityConfig
  sanityFetch: <T>(
    Astro: AstroGlobal,
    options: {
      query: string
      params?: QueryParams
    }
  ) => Promise<{ data: T }>
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

  const clientConfig: ClientConfig = {
    ...sanityConfig,
    ...config?.client,
  }

  const client = sanityCreateClient(clientConfig)

  async function sanityFetch<T>(
    Astro: AstroGlobal,
    { query, params = {} }: { query: string; params?: QueryParams }
  ): Promise<{ data: T }> {
    let lastLiveEventId: string | undefined
    const cookie = Astro.cookies.get(LIVE_EVENT_COOKIE)

    if (cookie) {
      lastLiveEventId = cookie.value
      Astro.cookies.delete(LIVE_EVENT_COOKIE)
      resetTags()
    }

    const { result, syncTags = [] } = await client.fetch(query, params, {
      lastLiveEventId,
      filterResponse: false,
    })

    addTags(syncTags)

    return { data: result as T }
  }

  setConfig(sanityConfig)

  return { client, config: sanityConfig, sanityFetch }
}

export { type SanityClient, type QueryParams }
