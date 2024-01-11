import { ModuleKind } from "typescript"
import { expect, it } from 'vitest'
import { twoslasher } from "../src/index"
import { FEAT_SHOW_EMIT } from "./FEATURES"

it.skipIf(!FEAT_SHOW_EMIT)("emits CommonJS", () => {
  const files = `
// @filename: file-with-export.ts
export const helloWorld = "Example string";

// @filename: index.ts
import {helloWorld} from "./file-with-export"
console.log(helloWorld)
`
  const result = twoslasher(files, "ts", {
    defaultOptions: { showEmit: true },
    defaultCompilerOptions: { module: ModuleKind.CommonJS }
  })
  expect(result.errors).toEqual([])
  expect(result.code!).toContain('require("./file-with-export")')
})
