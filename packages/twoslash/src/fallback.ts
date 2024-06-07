import { removeCodeRanges } from 'twoslash-protocol'
import { reAnnonateMarkers, reConfigBoolean, reConfigValue } from './regexp.js'
import type { TwoslashReturnMeta } from './types/index.js'
import { findCutNotations } from './utils.js'
import { flagKeys } from './flag-keys.js'

/**
 * A fallback function to strip out twoslash annotations from a string and does nothing else.
 *
 * This function does not returns the meta information about the removals.
 * It's designed to be used as a fallback when Twoslash fails.
 */
export function removeTwoslashNotations(code: string, customTags?: string[]): string {
  const meta: Pick<TwoslashReturnMeta, 'removals'> = {
    removals: [],
  }
  const tags = [
    ...customTags ?? [],
    ...flagKeys,
  ]

  Array.from(code.matchAll(reConfigBoolean)).forEach((match) => {
    if (!tags.includes(match[1]))
      return
    meta.removals.push([match.index!, match.index! + match[0].length + 1])
  })
  Array.from(code.matchAll(reConfigValue)).forEach((match) => {
    if (!tags.includes(match[1]))
      return
    meta.removals.push([match.index!, match.index! + match[0].length + 1])
  })

  findCutNotations(code, meta)
  Array.from(code.matchAll(reAnnonateMarkers)).forEach((match) => {
    const index = match.index!
    meta.removals.push([index, index + match[0].length + 1])
  })

  return removeCodeRanges(code, meta.removals).code
}
