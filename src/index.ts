import process from "node:process";
import * as ts from "typescript/lib/tsserverlibrary"
import type { TwoSlashOptions} from "./core";
import { twoslasher as twoslasherCore } from "./core"

export function twoslasher(code: string, lang: string, opts?: TwoSlashOptions) {
  return twoslasherCore(code, lang, {
    vfsRoot: process.cwd(),
    tsModule: ts,
    ...opts
  })
}

export type {
  TwoSlashOptions,
  TwoSlashReturn,
} from "./core"
export {
  TwoslashError
} from "./core"
