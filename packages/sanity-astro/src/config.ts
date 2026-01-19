import type { SanityConfig } from './init'

let _config: SanityConfig | null = null
let _tags: string[] = []

export function setConfig(config: SanityConfig) {
  _config = config
}

export function getConfig(): SanityConfig {
  if (!_config) {
    throw new Error(
      '@tinloof/sanity-astro: initSanity() must be called before using SanityLive.'
    )
  }
  return _config
}

export function addTags(tags: string[]) {
  _tags = [...new Set([..._tags, ...tags])]
}

export function getTags(): string[] {
  return _tags
}

export function resetTags() {
  _tags = []
}
