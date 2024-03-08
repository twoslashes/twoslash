import { createDefaultMapFromNodeModules } from '@typescript/vfs'
import { expect, it } from 'vitest'
import { twoslasher } from '../src/index'

const dt = `
declare namespace G {
      function hasMagic(pattern: string, options?: IOptions): boolean;
}        
export = G;
`

it('works with a dependency in @types for the project', async () => {
  const fsMap = createDefaultMapFromNodeModules({})
  fsMap.set('/node_modules/@types/glob/index.d.ts', dt)

  const file = `
import glob from "glob"
glob.hasMagic("OK")
//   ^?
  `
  const result = await twoslasher(file, 'ts', { fsMap })
  expect(result.errors).toEqual([])
  expect(result.queries[0].text!.includes('hasMagic')).toBeTruthy()
})
