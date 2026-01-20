import type { AstroIntegration } from 'astro'
import { fileURLToPath } from 'node:url'
import { vitePluginSanityClient } from './vite-plugin-sanity-client'
import { vitePluginSanityStudio } from './vite-plugin-sanity-studio'

// Resolve paths relative to this file
const resolveRelative = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url))

export type StegaConfig = {
  enabled?: boolean
  studioUrl?: string
}

export type SanityIntegrationConfig = {
  /**
   * Sanity project ID
   */
  projectId: string
  /**
   * Sanity dataset name
   */
  dataset: string
  /**
   * API version (default: '2025-10-01')
   */
  apiVersion?: string
  /**
   * Use Sanity CDN (default: true)
   */
  useCdn?: boolean
  /**
   * Base path for Sanity Studio (e.g., '/studio' or '/cms')
   * If provided, studio routes will be injected automatically.
   */
  studioBasePath?: string
  /**
   * Stega configuration for visual editing
   */
  stega?: StegaConfig
}

const DEFAULT_API_VERSION = '2025-10-01'

/**
 * Astro integration for Sanity CMS.
 *
 * Provides:
 * - `sanity:client` virtual module with pre-configured Sanity client
 * - `sanity:studio` virtual module with Sanity Studio config (if studioBasePath is set)
 * - Automatic studio route injection (if studioBasePath is set)
 *
 * @example
 * ```ts
 * // astro.config.mjs
 * import { defineConfig } from 'astro/config'
 * import sanity from '@tinloof/sanity-astro'
 *
 * export default defineConfig({
 *   integrations: [
 *     sanity({
 *       projectId: 'your-project-id',
 *       dataset: 'production',
 *       studioBasePath: '/studio',
 *     }),
 *   ],
 * })
 * ```
 */
export default function sanityIntegration(config: SanityIntegrationConfig): AstroIntegration {
  // Validate config
  if (!config.projectId) {
    throw new Error('[@tinloof/sanity-astro]: projectId is required')
  }
  if (!config.dataset) {
    throw new Error('[@tinloof/sanity-astro]: dataset is required')
  }

  if (config.studioBasePath) {
    // Ensure studioBasePath is relative
    if (config.studioBasePath.includes('://')) {
      throw new Error(
        '[@tinloof/sanity-astro]: studioBasePath must be a relative path (e.g., "/studio"), not a full URL.'
      )
    }
    // Ensure it starts with /
    if (!config.studioBasePath.startsWith('/')) {
      config.studioBasePath = '/' + config.studioBasePath
    }
  }

  const normalizedConfig: SanityIntegrationConfig = {
    ...config,
    apiVersion: config.apiVersion || DEFAULT_API_VERSION,
    useCdn: config.useCdn ?? true,
  }

  return {
    name: '@tinloof/sanity-astro',
    hooks: {
      'astro:config:setup': ({ config: astroConfig, updateConfig, injectRoute, addClientDirective, logger }) => {
        logger.info('Setting up Sanity integration')

        // Register client:visualEditing directive
        // Only hydrates components when visual editing mode is enabled
        addClientDirective({
          name: 'visualEditing',
          entrypoint: resolveRelative('./directives/visual-editing.ts'),
        })

        // Update Vite config with our plugins and optimizations
        updateConfig({
          vite: {
            plugins: [
              vitePluginSanityClient(normalizedConfig),
              vitePluginSanityStudio(normalizedConfig),
            ],
            optimizeDeps: {
              include: [
                'react/jsx-runtime',
                'react/jsx-dev-runtime',
                'react-dom/client',
                'styled-components',
                // Sanity dependencies that benefit from pre-bundling
                '@sanity/client',
              ],
              exclude: ['@tinloof/sanity-astro'],
            },
            ssr: {
              // Ensure these are externalized for SSR
              noExternal: ['@sanity/client'],
            },
          },
        })

        // Inject studio routes if studioBasePath is configured
        if (normalizedConfig.studioBasePath) {
          const studioRoutePath = normalizedConfig.studioBasePath.replace(/^\//, '') + '/[...path]'

          logger.info(`Injecting studio route at ${normalizedConfig.studioBasePath}`)

          injectRoute({
            pattern: studioRoutePath,
            entrypoint: '@tinloof/sanity-astro/studio-route',
            prerender: false, // Studio needs to be SSR/SPA
          })
        }
      },
    },
  }
}

export type { SanityIntegrationConfig as Config }
