import ts from 'typescript'
import type { TwoSlashOptions } from './core'
import { createTwoSlasher as _createTwoSlasher, twoslasher as _twoslasher } from './core'
import { convertLegacyOptions, convertLegacyReturn } from './legacy'
import type { TwoSlashOptionsLegacy, TwoSlashReturnLegacy } from './legacy'

export * from './public'
export * from './legacy'

// eslint-disable-next-line node/prefer-global/process
const cwd = /* @__PURE__ */ typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : ''

/**
 * Create a TwoSlash instance with cached TS environments
 */
export function createTwoSlasher(opts?: TwoSlashOptions) {
  return _createTwoSlasher({
    vfsRoot: cwd,
    tsModule: ts,
    ...opts,
  })
}

/**
 * Get type results from a code sample
 */
export function twoslasher(code: string, lang: string, opts?: TwoSlashOptions) {
  return _twoslasher(code, lang, {
    vfsRoot: cwd,
    tsModule: ts,
    ...opts,
  })
}

/**
 * Compatability wrapper to align with `@typescript/twoslash`'s input/output
 *
 * @deprecated migrate to `twoslasher` instead
 */
export function twoslasherLegacy(code: string, lang: string, opts?: TwoSlashOptionsLegacy): TwoSlashReturnLegacy {
  return convertLegacyReturn(
    _twoslasher(code, lang, convertLegacyOptions({
      vfsRoot: cwd,
      tsModule: ts,
      ...opts,
    })),
  )
}
