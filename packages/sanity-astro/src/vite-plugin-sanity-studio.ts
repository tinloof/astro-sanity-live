import type { Plugin, ResolvedConfig } from 'vite'
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
