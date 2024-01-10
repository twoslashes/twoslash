import { expect, it } from 'vitest'
import * as ts from 'typescript/lib/tsserverlibrary'
import type { TwoSlashReturnNew } from "../src/types-new"
import { twoslasher } from '../src'

export type TS = typeof import("typescript")

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


function verifyResult(result: TwoSlashReturnNew) {
  for (const token of result.tokens) {
    if ('target' in token)
      expect.soft(result.code.slice(token.offset, token.offset + token.length)).toBe(token.target)
  }
}

it('should pass', () => {
  const result = twoslasher(code, 'ts', {
    tsModule: ts,
    vfsRoot: process.cwd()
  })

  verifyResult(result)

  const resultClean = JSON.parse(JSON.stringify(result, null, 2))

  expect(resultClean.tokens).toMatchInlineSnapshot(`
    [
      {
        "length": 11,
        "offset": 9,
        "target": "createLabel",
        "text": "function createLabel<T extends string | number>(idOrName: T): NameOrId<T>",
        "type": "quick-info",
      },
      {
        "length": 1,
        "offset": 21,
        "target": "T",
        "text": "(type parameter) T in createLabel<T extends string | number>(idOrName: T): NameOrId<T>",
        "type": "quick-info",
      },
      {
        "length": 8,
        "offset": 48,
        "target": "idOrName",
        "text": "(parameter) idOrName: T extends string | number",
        "type": "quick-info",
      },
      {
        "length": 1,
        "offset": 58,
        "target": "T",
        "text": "(type parameter) T in createLabel<T extends string | number>(idOrName: T): NameOrId<T>",
        "type": "quick-info",
      },
      {
        "length": 8,
        "offset": 62,
        "target": "NameOrId",
        "text": "type NameOrId<T extends string | number> = T extends number ? IdLabel : NameLabel",
        "type": "quick-info",
      },
      {
        "length": 1,
        "offset": 71,
        "target": "T",
        "text": "(type parameter) T in createLabel<T extends string | number>(idOrName: T): NameOrId<T>",
        "type": "quick-info",
      },
      {
        "length": 1,
        "offset": 109,
        "target": "a",
        "text": "let a: NameLabel",
        "type": "query",
      },
      {
        "length": 11,
        "offset": 113,
        "target": "createLabel",
        "text": "function createLabel<"typescript">(idOrName: "typescript"): NameLabel",
        "type": "quick-info",
      },
      {
        "length": 1,
        "offset": 144,
        "target": "b",
        "text": "let b: IdLabel",
        "type": "highlight",
      },
      {
        "length": 11,
        "offset": 148,
        "target": "createLabel",
        "text": "function createLabel<2.8>(idOrName: 2.8): IdLabel",
        "type": "highlight",
      },
      {
        "length": 1,
        "offset": 171,
        "target": "c",
        "text": "let c: IdLabel | NameLabel",
        "type": "quick-info",
      },
      {
        "length": 11,
        "offset": 175,
        "target": "createLabel",
        "text": "function createLabel<"hello" | 42>(idOrName: "hello" | 42): IdLabel | NameLabel",
        "type": "quick-info",
      },
      {
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
        "offset": 177,
        "type": "completion",
      },
      {
        "docs": "An intrinsic object that provides basic mathematics functionality and constants.",
        "length": 4,
        "offset": 187,
        "target": "Math",
        "text": "var Math: Math",
        "type": "quick-info",
      },
      {
        "docs": "Returns a pseudorandom number between 0 and 1.",
        "length": 6,
        "offset": 192,
        "target": "random",
        "text": "(method) Math.random(): number",
        "type": "quick-info",
      },
    ]
  `)
})
