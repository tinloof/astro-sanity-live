import { initSanity } from '@tinloof/sanity-astro/init'
import '@/sanity/types'

export const { client, config, sanityFetch } = initSanity()
