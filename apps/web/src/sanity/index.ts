import { createSanityLoader } from '@tinloof/sanity-astro/loader'
import '@/sanity/types'

export const { client, config, loadQuery } = createSanityLoader()
