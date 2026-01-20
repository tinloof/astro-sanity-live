import type { Plugin, ResolvedConfig, UserConfig } from 'vite'
import { loadEnv } from 'vite'
import type { SanityIntegrationConfig } from './integration'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const VIRTUAL_MODULE_ID = 'sanity:studio'
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID

/**
 * Vite plugin that creates a virtual module `sanity:studio`
 * which exports the Sanity Studio configuration.
 *
 * It resolves the sanity.config.ts|js file from the project root
 * and overrides basePath with the studioBasePath from the integration config.
 */
export function vitePluginSanityStudio(config: SanityIntegrationConfig): Plugin {
  let viteConfig: ResolvedConfig

  return {
    name: 'vite-plugin-sanity-studio',
    config(_config: UserConfig, { mode }) {
      // Load env files to get SANITY_STUDIO_* and PUBLIC_SANITY_* vars
      const env = loadEnv(mode, process.cwd(), ['SANITY_STUDIO_', 'PUBLIC_SANITY_'])

      // Define process.env.SANITY_STUDIO_* for browser environments
      // This allows sanity.config.ts to use process.env which works in both
      // Node.js (Sanity CLI) and browser (via Vite replacement)
      return {
        define: {
          'process.env.SANITY_STUDIO_PROJECT_ID': JSON.stringify(
            env.SANITY_STUDIO_PROJECT_ID || env.PUBLIC_SANITY_PROJECT_ID || ''
          ),
          'process.env.SANITY_STUDIO_DATASET': JSON.stringify(
            env.SANITY_STUDIO_DATASET || env.PUBLIC_SANITY_DATASET || ''
          ),
        },
      }
    },
    configResolved(resolved) {
      viteConfig = resolved
    },
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID
      }
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        if (!config.studioBasePath) {
          throw new Error(
            '[@tinloof/sanity-astro]: studioBasePath is required to use sanity:studio. ' +
            'Add it to your sanity() integration config in astro.config.mjs.'
          )
        }

        // Find the sanity config file
        const root = viteConfig?.root || process.cwd()
        const possiblePaths = [
          resolve(root, 'sanity.config.ts'),
          resolve(root, 'sanity.config.js'),
          resolve(root, 'sanity.config.mjs'),
          // Also check packages/sanity for monorepo setups
          resolve(root, '../sanity/sanity.config.ts'),
          resolve(root, '../../packages/sanity/sanity.config.ts'),
        ]

        let sanityConfigPath: string | undefined
        for (const p of possiblePaths) {
          if (existsSync(p)) {
            sanityConfigPath = p
            break
          }
        }

        if (!sanityConfigPath) {
          throw new Error(
            '[@tinloof/sanity-astro]: Could not find sanity.config.ts|js. ' +
            'Make sure you have a Sanity configuration file in your project.'
          )
        }

        const studioBasePath = JSON.stringify(config.studioBasePath)

        return `
import { defineConfig } from 'sanity'
import baseConfig from '${sanityConfigPath}'

// Override basePath from sanity.config.ts with the integration setting
const configWithBasePath = {
  ...baseConfig,
  basePath: ${studioBasePath},
}

export const studioConfig = defineConfig(configWithBasePath)
`
      }
    },
  }
}
