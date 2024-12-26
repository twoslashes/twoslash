import type { TwoslashReturn } from '../src/types'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { twoslasher } from '../src'
import { splitFiles } from '../src/utils'

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

function verifyResult(result: TwoslashReturn) {
  for (const node of result.nodes) {
    if ('target' in node)
      expect.soft(result.code.slice(node.start, node.start + node.length)).toBe(node.target)
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
        "filepath": "test.ts",
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
        "filepath": "maths.ts",
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
        "filepath": "index.ts",
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
})
