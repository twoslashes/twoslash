/// <reference types="vite/client" />

import type { TwoslashReturn } from '../src/types'
import { extname } from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { createTwoslasher, removeTwoslashNotations } from '../src/index'

// To add a test, create a file in the fixtures folder and it will will run through
// as though it was the codeblock.

const fixtures = import.meta.glob<string>('./fixtures/**/*.*', { query: '?raw', import: 'default' })

// A temporary list of regex to match with the path of the file to test
const filters: RegExp[] = [
  // /completions-edge-2/,
]

if (process.env.CI && filters.length)
  throw new Error('Should not filters fixture tests in CI, did you forget to remove them?')

const twoslasher = createTwoslasher()

Object.entries(fixtures).forEach(([path, fixture]) => {
  path = path.replace(/\\/g, '/')
  const expectThrows = path.includes('/throws/')
  const inExt = extname(path).slice(1)
  const outExt = expectThrows ? '.txt' : '.json'
  const outPath = path.replace('/fixtures/', '/results/').replace(/\.[^/.]+$/, outExt)

  it.skipIf(filters.length && !filters.some(f => path.match(f)))(
    path,
    async () => {
      let result: TwoslashReturn = undefined!
      const code = await fixture()
      try {
        result = twoslasher(
          code,
          inExt,
          {
            customTags: ['annotate'],
          },
        )
      }
      catch (err: any) {
        if (expectThrows) {
          await expect(err.message).toMatchFileSnapshot(outPath)
          return
        }
        else {
          throw err
        }
      }

      if (expectThrows) {
        throw new Error('Expected to throw')
      }

      else {
        await expect(cleanFixture(result))
          .toMatchFileSnapshot(outPath)

        if (!result.meta.handbookOptions.showEmit) {
          expect(removeTwoslashNotations(code))
            .toEqual(result.code)
        }
      }
    },
  )
})

function cleanFixture(result: TwoslashReturn) {
  return JSON.stringify({
    code: result.code,
    nodes: result.nodes,
    flags: result.meta.flagNotations,
    // compilerOptions: ts.meta.compilerOptions
  }, null, 2).replaceAll(process.cwd(), '[home]')
}
