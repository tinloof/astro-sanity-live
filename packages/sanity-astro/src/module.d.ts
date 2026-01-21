/**
 * Type declarations for virtual modules provided by @tinloof/sanity-astro.
 *
 * To use these types, add a reference to this file in your project:
 * /// <reference types="@tinloof/sanity-astro/module" />
 *
 * Or add "@tinloof/sanity-astro" to your tsconfig.json types array.
 */

declare module 'sanity:studio' {
  import type { Config } from 'sanity'

  /**
   * Sanity Studio configuration.
   * Loaded from your sanity.config.ts|js file with basePath overridden
   * by the studioBasePath setting in the integration config.
   */
  export const studioConfig: Config
}
