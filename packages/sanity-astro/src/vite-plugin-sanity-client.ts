import type { Plugin } from 'vite'
import type { SanityIntegrationConfig } from './integration'

const VIRTUAL_MODULE_ID = 'sanity:client'
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID

/**
 * Vite plugin that creates a virtual module `sanity:client`
 * which exports a pre-configured Sanity client.
 *
 * Note: If we need to support functions in config (e.g., custom fetch),
 * we'll need to switch from JSON.stringify to serialize-javascript.
 */
export function vitePluginSanityClient(config: SanityIntegrationConfig): Plugin {
  const clientConfig = {
    projectId: config.projectId,
    dataset: config.dataset,
    apiVersion: config.apiVersion || '2025-10-01',
    useCdn: config.useCdn ?? true,
    ...(config.stega && { stega: config.stega }),
  }

  return {
    name: 'vite-plugin-sanity-client',
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID
      }
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return `
import { createClient } from '@sanity/client'

export const sanityClient = createClient(${JSON.stringify(clientConfig)})

export const config = ${JSON.stringify(clientConfig)}
`
      }
    },
  }
}
