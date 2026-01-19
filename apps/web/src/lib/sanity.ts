import { initSanity } from '@tinloof/sanity-astro/init'
import '@packages/sanity/types'

export const { client, config, sanityFetch } = initSanity()
