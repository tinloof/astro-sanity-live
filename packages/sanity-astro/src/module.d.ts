/**
 * Type declarations for virtual modules provided by @tinloof/sanity-astro.
 *
 * To use these types, add a reference to this file in your project:
 * /// <reference types="@tinloof/sanity-astro/module" />
 *
 * Or add "@tinloof/sanity-astro" to your tsconfig.json types array.
 */

declare module 'sanity:client' {
  import type { SanityClient } from '@sanity/client'

  /**
   * Pre-configured Sanity client instance.
   * Configuration is provided via the sanity() integration in astro.config.mjs.
   */
  export const sanityClient: SanityClient

  /**
   * The configuration object used to create the client.
   */
  export const config: {
    projectId: string
    dataset: string
    apiVersion: string
    useCdn: boolean
    stega?: {
      enabled?: boolean
      studioUrl?: string
    }
  }
}

declare module 'sanity:studio' {
  import type { Config } from 'sanity'

  /**
   * Sanity Studio configuration.
   * Loaded from your sanity.config.ts|js file with basePath overridden
   * by the studioBasePath setting in the integration config.
   */
  export const studioConfig: Config
}

/**
 * Extend Astro's client directive types to include client:visualEditing.
 * This directive only hydrates components when visual editing mode is enabled.
 */
declare namespace astroHTML.JSX {
  interface AstroClientDirectives {
    /**
     * Only hydrate this component when Sanity visual editing mode is enabled.
     * Checks URL parameter and cookie for the visual editing flag.
     *
     * @example
     * ```astro
     * <MyComponent client:visualEditing {...result} />
     * ```
     */
    'client:visualEditing'?: boolean
  }
}
