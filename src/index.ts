export type {
  TwoSlashOptions,
  TwoSlashReturn,
} from "./core"
export {
  TwoslashError
} from "./core"
import * as ts from "typescript/lib/tsserverlibrary"
import { TwoSlashOptions, twoslasher as twoslasherCore } from "./core"

export function twoslasher(code: string, lang: string, opts?: TwoSlashOptions) {
  return twoslasherCore(code, lang, {
    vfsRoot: process.cwd(),
    tsModule: ts,
    ...opts
  })
}
