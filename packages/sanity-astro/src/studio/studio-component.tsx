import { createHashHistory, type History, type Listener } from 'history'
import { Studio } from 'sanity'
import { useMemo } from 'react'
import { studioConfig } from 'sanity:studio'

if (!studioConfig) {
  throw new Error(
    "[@tinloof/sanity-astro]: Can't load Sanity Studio. " +
    'Check that you have a valid sanity.config.ts|js file.'
  )
}

/**
 * React component that renders Sanity Studio.
 * Uses hash-based routing for compatibility with static hosting.
 */
export default function StudioComponent() {
  const history = useMemo(() => createHashHistoryAdapter(), [])

  return (
    <div
      data-ui="SanityStudioLayout"
      style={{
        height: '100vh',
        maxHeight: '100dvh',
        overscrollBehavior: 'none',
        WebkitFontSmoothing: 'antialiased',
        overflow: 'hidden',
      }}
    >
      <Studio config={studioConfig} unstable_history={history} />
    </div>
  )
}

/**
 * Creates a hash history adapter for Sanity Studio.
 *
 * This works around a discrepancy between the history npm package interface
 * and what Sanity Studio expects. The npm package provides
 * history.listen(({action, location}) => void) but Studio expects
 * history.listen(location => void).
 */
function createHashHistoryAdapter(): History {
  const history = createHashHistory()

  return {
    get action() {
      return history.action
    },
    get location() {
      return history.location
    },
    get createHref() {
      return history.createHref
    },
    get push() {
      return history.push
    },
    get replace() {
      return history.replace
    },
    get go() {
      return history.go
    },
    get back() {
      return history.back
    },
    get forward() {
      return history.forward
    },
    get block() {
      return history.block
    },
    listen(listener: Listener) {
      return history.listen(({ location }) => {
        // @ts-expect-error - Adapting interface for Sanity Studio
        listener(location)
      })
    },
  }
}
