/**
 * client:visualEditing directive
 *
 * Only hydrates the component when visual editing mode is enabled.
 * Checks URL parameter and cookie for visual editing flag.
 */

import type { ClientDirective } from 'astro'
import { VISUAL_EDITING_ENABLED } from '../constants'

function isVisualEditingEnabled(): boolean {
  // Check URL parameter first (works even when cookies are blocked in iframes)
  const urlParams = new URLSearchParams(window.location.search)
  if (urlParams.has(VISUAL_EDITING_ENABLED)) {
    return true
  }

  // Fall back to cookie check
  return document.cookie.includes(`${VISUAL_EDITING_ENABLED}=true`)
}

const clientDirective: ClientDirective = (load, _opts, _el) => {
  // Only hydrate if visual editing is enabled
  if (!isVisualEditingEnabled()) {
    return
  }

  // Hydrate immediately when in visual editing mode
  load().then((hydrate) => hydrate())
}

export default clientDirective
