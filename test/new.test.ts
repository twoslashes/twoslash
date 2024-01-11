import { expect, it } from 'vitest'
import * as ts from 'typescript/lib/tsserverlibrary'
import { splitFiles } from '../src/utils'
import type { TwoSlashReturn } from '../src/types'
import { twoslasher } from '../src'

export type TS = typeof import('typescript')

const code = `
// @errors: 6133

interface IdLabel { id: number, /* some fields */ }
interface NameLabel { name: string, /* other fields */ }
type NameOrId<T extends number | string> = T extends number ? IdLabel : NameLabel;
// This comment should not be included

// ---cut---
function createLabel<T extends number | string>(idOrName: T): NameOrId<T> {
    throw "unimplemented"
}

let a = createLabel("typescript");
//  ^?

let b = createLabel(2.8);
//  ^^^^^^^

let c = createLabel(Math.random() ? "hello" : 42);
//        ^|
// ---cut-after---
console.log(a.name);
`

function verifyResult(result: TwoSlashReturn) {
  for (const token of result.tokens) {
    if ('target' in token)
      expect.soft(result.code.slice(token.start, token.start + token.length)).toBe(token.target)
  }
}

it('split files', () => {
  const files = splitFiles(`
// @module: esnext
// @filename: maths.ts
export function absolute(num: number) {
  if (num < 0) return num * -1;
  return num;
}
// @filename: index.ts
// ---cut---
import {absolute} from "./maths"
const value = absolute(-1)
//    ^?
`, 'test.ts', '')
  expect(files).toMatchInlineSnapshot(`
    [
      {
        "content": "
    // @module: esnext
    ",
        "extension": "ts",
        "filename": "test.ts",
        "offset": 0,
      },
      {
        "content": "// @filename: maths.ts
    export function absolute(num: number) {
      if (num < 0) return num * -1;
      return num;
    }
    ",
        "extension": "ts",
        "filename": "maths.ts",
        "offset": 20,
      },
      {
        "content": "// @filename: index.ts
    // ---cut---
    import {absolute} from "./maths"
    const value = absolute(-1)
    //    ^?
    ",
        "extension": "ts",
        "filename": "index.ts",
        "offset": 131,
      },
    ]
  `)
})

it('should pass', () => {
  const result = twoslasher(code, 'ts', {
    tsModule: ts,
    vfsRoot: process.cwd(),
  })

  verifyResult(result)

  const resultClean = JSON.parse(JSON.stringify(result, null, 2))

  expect(resultClean.tokens).toMatchInlineSnapshot(`
    [
      {
        "character": 9,
        "length": 11,
        "line": 0,
        "start": 9,
        "target": "createLabel",
        "text": "function createLabel<T extends string | number>(idOrName: T): NameOrId<T>",
        "type": "hover",
      },
      {
        "character": 21,
        "length": 1,
        "line": 0,
        "start": 21,
        "target": "T",
        "text": "(type parameter) T in createLabel<T extends string | number>(idOrName: T): NameOrId<T>",
        "type": "hover",
      },
      {
        "character": 48,
        "length": 8,
        "line": 0,
        "start": 48,
        "target": "idOrName",
        "text": "(parameter) idOrName: T extends string | number",
        "type": "hover",
      },
      {
        "character": 58,
        "length": 1,
        "line": 0,
        "start": 58,
        "target": "T",
        "text": "(type parameter) T in createLabel<T extends string | number>(idOrName: T): NameOrId<T>",
        "type": "hover",
      },
      {
        "character": 62,
        "length": 8,
        "line": 0,
        "start": 62,
        "target": "NameOrId",
        "text": "type NameOrId<T extends string | number> = T extends number ? IdLabel : NameLabel",
        "type": "hover",
      },
      {
        "character": 71,
        "length": 1,
        "line": 0,
        "start": 71,
        "target": "T",
        "text": "(type parameter) T in createLabel<T extends string | number>(idOrName: T): NameOrId<T>",
        "type": "hover",
      },
      {
        "character": 4,
        "length": 1,
        "line": 4,
        "start": 109,
        "target": "a",
        "text": "let a: NameLabel",
        "type": "hover",
      },
      {
        "character": 4,
        "length": 1,
        "line": 4,
        "start": 109,
        "target": "a",
        "text": "let a: NameLabel",
        "type": "query",
      },
      {
        "character": 8,
        "length": 11,
        "line": 4,
        "start": 113,
        "target": "createLabel",
        "text": "function createLabel<"typescript">(idOrName: "typescript"): NameLabel",
        "type": "hover",
      },
      {
        "character": 4,
        "length": 1,
        "line": 6,
        "start": 145,
        "target": "b",
        "text": "let b: IdLabel",
        "type": "hover",
      },
      {
        "character": 4,
        "length": 1,
        "line": 6,
        "start": 145,
        "target": "b",
        "text": "let b: IdLabel",
        "type": "highlight",
      },
      {
        "character": 8,
        "length": 11,
        "line": 6,
        "start": 149,
        "target": "createLabel",
        "text": "function createLabel<2.8>(idOrName: 2.8): IdLabel",
        "type": "hover",
      },
      {
        "character": 8,
        "length": 11,
        "line": 6,
        "start": 149,
        "target": "createLabel",
        "text": "function createLabel<2.8>(idOrName: 2.8): IdLabel",
        "type": "highlight",
      },
      {
        "character": 4,
        "length": 1,
        "line": 8,
        "start": 172,
        "target": "c",
        "text": "let c: IdLabel | NameLabel",
        "type": "hover",
      },
      {
        "character": 8,
        "length": 11,
        "line": 8,
        "start": 176,
        "target": "createLabel",
        "text": "function createLabel<"hello" | 42>(idOrName: "hello" | 42): IdLabel | NameLabel",
        "type": "hover",
      },
      {
        "character": 10,
        "completions": [
          {
            "kind": "function",
            "kindModifiers": "",
            "name": "createLabel",
            "sortText": "11",
          },
          {
            "kind": "function",
            "kindModifiers": "declare",
            "name": "createImageBitmap",
            "sortText": "15",
          },
          {
            "kind": "var",
            "kindModifiers": "declare",
            "name": "crossOriginIsolated",
            "sortText": "15",
          },
          {
            "kind": "var",
            "kindModifiers": "declare",
            "name": "crypto",
            "sortText": "15",
          },
        ],
        "completionsPrefix": "cr",
        "length": 0,
        "line": 8,
        "start": 178,
        "type": "completion",
      },
      {
        "character": 20,
        "docs": "An intrinsic object that provides basic mathematics functionality and constants.",
        "length": 4,
        "line": 8,
        "start": 188,
        "target": "Math",
        "text": "var Math: Math",
        "type": "hover",
      },
      {
        "character": 25,
        "docs": "Returns a pseudorandom number between 0 and 1.",
        "length": 6,
        "line": 8,
        "start": 193,
        "target": "random",
        "text": "(method) Math.random(): number",
        "type": "hover",
      },
    ]
  `)
})
