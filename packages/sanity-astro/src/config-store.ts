/**
 * Centralized config store for Sanity configuration.
 *
 * This allows initSanity() to register config once,
 * and components can access it without needing props.
 */

import { DEFAULT_API_VERSION, DEFAULT_PURGE_ENDPOINT, DEFAULT_REFRESH_DEBOUNCE } from './constants'

export type SanityConfig = {
  projectId: string
  dataset: string
  apiVersion: string
  useCdn?: boolean
}

export type LiveConfig = {
  purgeEndpoint: string
  refreshDebounce: number
}

export type StegaConfig = {
  studioUrl: string
}

type StoredConfig = {
  sanity: SanityConfig
  live: LiveConfig
  stega: StegaConfig
} | null

// Module-level config store
let storedConfig: StoredConfig = null

/**
 * Register Sanity config (called by initSanity)
 */
export function registerConfig(config: {
  sanity: SanityConfig
  live?: Partial<LiveConfig>
  stega?: Partial<StegaConfig>
}): void {
  storedConfig = {
    sanity: config.sanity,
    live: {
      purgeEndpoint: config.live?.purgeEndpoint ?? DEFAULT_PURGE_ENDPOINT,
      refreshDebounce: config.live?.refreshDebounce ?? DEFAULT_REFRESH_DEBOUNCE,
    },
    stega: {
      studioUrl: config.stega?.studioUrl ?? '/cms',
    },
  }
}

/**
 * Get Sanity config (for components).
 * Falls back to environment variables if initSanity wasn't called.
 */
export function getSanityConfig(): SanityConfig {
  if (storedConfig) {
    return storedConfig.sanity
  }

  // Fallback to env vars
  const projectId = import.meta.env.PUBLIC_SANITY_PROJECT_ID
  const dataset = import.meta.env.PUBLIC_SANITY_DATASET
  const apiVersion = import.meta.env.PUBLIC_SANITY_API_VERSION || DEFAULT_API_VERSION

  if (!projectId || !dataset) {
    throw new Error(
      '[Sanity] Missing config. Either call initSanity() or set PUBLIC_SANITY_PROJECT_ID and PUBLIC_SANITY_DATASET environment variables.'
    )
  }

  return {
    projectId,
    dataset,
    apiVersion,
    useCdn: true,
  }
}

/**
 * Get live config (for SanityLive component)
 */
export function getLiveConfig(): LiveConfig {
  if (storedConfig) {
    return storedConfig.live
  }

  return {
    purgeEndpoint: DEFAULT_PURGE_ENDPOINT,
    refreshDebounce: DEFAULT_REFRESH_DEBOUNCE,
  }
}

/**
 * Get stega config (for VisualEditing component)
 */
export function getStegaConfig(): StegaConfig {
  if (storedConfig) {
    return storedConfig.stega
  }

  return {
    studioUrl: '/cms',
  }
}

/**
 * Check if initSanity was called
 */
export function isConfigured(): boolean {
  return storedConfig !== null
}
