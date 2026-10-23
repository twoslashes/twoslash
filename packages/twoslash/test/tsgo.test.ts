import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import ts7 from 'typescript7'
import { afterAll, expect, it } from 'vitest'
import { createTwoslasher, createTwoslasherAsync } from '../src/index'

// Types are resolved from TypeScript 6, while the TypeScript 7 entry only exposes its version
const tsModule = ts7 as unknown as typeof import('typescript')
const twoslasher = createTwoslasherAsync({
  tsModule,
  tsPackageDirectory: dirname(createRequire(import.meta.url).resolve('typescript7/package.json')),
})
afterAll(() => twoslasher.close())

it('points the sync API to the async one', () => {
  expect(() => createTwoslasher({ tsModule })).toThrow('createTwoslasherAsync')
})

it('runs overlapping calls one after another', async () => {
  const results = await Promise.all([
    twoslasher('const a = 1\n//    ^?\n'),
    twoslasher('const b = "b"\n//    ^?\n'),
  ])
  expect(results.map(i => i.queries[0].text)).toEqual(['const a: 1', 'const b: "b"'])
})

it('applies compiler flags', async () => {
  const code = '// @noImplicitAny: false\nfunction fn(s) {}\n'
  expect((await twoslasher(code)).errors).toEqual([])
  await expect(twoslasher(code.split('\n').slice(1).join('\n'))).rejects.toThrow('7006')
})

it('rejects options TypeScript 7 removed', async () => {
  await expect(twoslasher('// @target: es5\nconst a = 1\n')).rejects.toThrow('Invalid compiler options')
})

it('rejects showEmit', async () => {
  await expect(twoslasher('// @showEmit\nconst a = 1\n')).rejects.toThrow(`Option 'showEmit' is not supported`)
})

it('rejects files in directories that do not exist', async () => {
  await expect(twoslasher('// @filename: missing/a.ts\nexport const a = 1\n')).rejects.toThrow(`Directory`)
})
