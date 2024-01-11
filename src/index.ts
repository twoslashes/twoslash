import ts from 'typescript'
import type { TwoSlashOptions } from './core'
import { createTwoSlasher as _createTwoSlasher, twoslasher as _twoslasher } from './core'

// eslint-disable-next-line node/prefer-global/process
const cwd = /* @__PURE__ */ typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : ''

export function twoslasher(code: string, lang: string, opts?: TwoSlashOptions) {
  return _twoslasher(code, lang, {
    vfsRoot: cwd,
    tsModule: ts,
    ...opts,
  })
}

export function createTwoSlasher(opts?: TwoSlashOptions) {
  return _createTwoSlasher({
    vfsRoot: cwd,
    tsModule: ts,
    ...opts,
  })
}

export type * from './types'
export {
  TwoslashError,
} from './core'
