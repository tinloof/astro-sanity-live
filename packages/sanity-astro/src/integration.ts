import type { AstroIntegration } from 'astro'
import { vitePluginSanityStudio } from './vite-plugin-sanity-studio'

export type SanityIntegrationConfig = {
  /**
   * Base path for Sanity Studio (e.g., '/studio' or '/cms')
   * If provided, studio routes will be injected automatically.
   */
  studioBasePath?: string
}

/**
 * Astro integration for Sanity CMS.
 *
 * Provides:
 * - `sanity:studio` virtual module with Sanity Studio config (if studioBasePath is set)
 * - Automatic studio route injection (if studioBasePath is set)
 *
 * Configuration (projectId, dataset, etc.) is read from environment variables:
 * - PUBLIC_SANITY_PROJECT_ID
 * - PUBLIC_SANITY_DATASET
 * - SANITY_API_READ_TOKEN (optional, for draft access)
 *
 * @example
 * ```ts
 * // astro.config.mjs
 * import { defineConfig } from 'astro/config'
 * import sanity from '@tinloof/sanity-astro'
 *
 * export default defineConfig({
 *   integrations: [
 *     sanity({ studioBasePath: '/cms' }),
 *     // or just: sanity()
 *   ],
 * })
 * ```
 */
export default function sanityIntegration(config: SanityIntegrationConfig = {}): AstroIntegration {
  let studioBasePath = config.studioBasePath

  if (studioBasePath) {
    // Ensure studioBasePath is relative
    if (studioBasePath.includes('://')) {
      throw new Error(
        '[@tinloof/sanity-astro]: studioBasePath must be a relative path (e.g., "/studio"), not a full URL.'
      )
    }
    // Ensure it starts with /
    if (!studioBasePath.startsWith('/')) {
      studioBasePath = '/' + studioBasePath
    }
  }

  return {
    name: '@tinloof/sanity-astro',
    hooks: {
      'astro:config:setup': ({ updateConfig, injectRoute, logger }) => {
        logger.info('Setting up Sanity integration')

        // Build vite plugins array
        const vitePlugins = []
        if (studioBasePath) {
          vitePlugins.push(vitePluginSanityStudio({ studioBasePath }))
        }

        // Update Vite config with our plugins and optimizations
        updateConfig({
          vite: {
            plugins: vitePlugins,
            optimizeDeps: {
              include: [
                'react/jsx-runtime',
                'react/jsx-dev-runtime',
                'react-dom/client',
                'styled-components',
                '@sanity/client',
              ],
              exclude: ['@tinloof/sanity-astro'],
            },
            ssr: {
              noExternal: ['@sanity/client'],
            },
          },
        })

        // Inject studio routes if studioBasePath is configured
        if (studioBasePath) {
          const studioRoutePath = studioBasePath.replace(/^\//, '') + '/[...path]'

          logger.info(`Injecting studio route at ${studioBasePath}`)

          injectRoute({
            pattern: studioRoutePath,
            entrypoint: '@tinloof/sanity-astro/studio-route',
            prerender: false,
          })
        }
      },
    },
  }
}

export type { SanityIntegrationConfig as Config }
