import { createSanityLoader } from '@tinloof/sanity-astro/loader'
import '@/sanity/types'

export const { client, browserClient, config, loadQuery } = createSanityLoader()

// Re-export for backwards compatibility
export const sanityFetch = loadQuery
