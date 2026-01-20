'use client'

import { useSanityData } from '@tinloof/sanity-astro/hooks'
import type { HOME_QUERY_RESULT } from '@/sanity/types'
import type { QueryParams } from '@sanity/client'

type HomeContentProps = {
  query: string
  params: QueryParams
  initial: {
    data: HOME_QUERY_RESULT
    sourceMap: unknown
  }
}

/**
 * React island component that displays home content with live updates.
 * When in visual editing mode, this component receives real-time updates
 * from the Presentation tool via useSanityData.
 */
export default function HomeContent({ query, params, initial }: HomeContentProps) {
  const { data } = useSanityData<HOME_QUERY_RESULT>({
    query,
    params,
    initial,
  })

  return (
    <div>
      <h1>Sanity Data (Live):</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}
