import { ModuleKind } from 'typescript'
import { expect, it } from 'vitest'
import { twoslasher } from '../src/index'

it('emits CommonJS', () => {
  const files = `
// @filename: file-with-export.ts
export const helloWorld = "Example string";

// @filename: index.ts
import {helloWorld} from "./file-with-export"
console.log(helloWorld)
`
  const result = twoslasher(files, 'ts', {
    handbookOptions: { showEmit: true },
    compilerOptions: { module: ModuleKind.CommonJS },
  })
  expect(result.errors).toEqual([])
  expect(result.code!).toContain('require("./file-with-export")')
})

it('supports space before @filename', () => {
  const files = `
  // @filename: file-with-export.ts
export const helloWorld = "Example string";

  // @filename: index.ts
import {helloWorld} from "./file-with-export"
console.log(helloWorld)
`
  const result = twoslasher(files, 'ts', {
    handbookOptions: { showEmit: true },
    compilerOptions: { module: ModuleKind.CommonJS },
  })
  expect(result.errors).toEqual([])
  expect(result.code!).toContain('require("./file-with-export")')
})
