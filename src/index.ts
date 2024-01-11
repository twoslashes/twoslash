import process from "node:process";
import * as ts from "typescript/lib/tsserverlibrary"
import type { TwoSlashOptions } from "./core";
import { createTwoSlasher as _createTwoSlasher, twoslasher as _twoslasher } from "./core"

export function twoslasher(code: string, lang: string, opts?: TwoSlashOptions) {
  return _twoslasher(code, lang, {
    vfsRoot: process.cwd(),
    tsModule: ts,
    ...opts
  })
}

export function createTwoSlasher(opts?: TwoSlashOptions) {
  return _createTwoSlasher({
    vfsRoot: process.cwd(),
    tsModule: ts,
    ...opts
  })
}

export type * from "./types"
export {
  TwoslashError
} from "./core"
