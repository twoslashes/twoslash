/// <reference types="vite/client" />

import fs from 'node:fs/promises'
import { extname, join, parse } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import type { TwoslashReturn } from '../src/types'
import { createTwoslasher } from '../src/index'

// To add a test, create a file in the fixtures folder and it will will run through
// as though it was the codeblock.

const fixtures = import.meta.glob('./fixtures/**/*.*', { as: 'raw' })

const twoslasher = createTwoslasher()

Object.entries(fixtures).forEach(([path, fixture]) => {
  path = path.replace(/\\/g, '/')
  const expectThrows = path.includes('/throws/')
  const inExt = extname(path).slice(1)
  const outExt = expectThrows ? '.txt' : '.json'
  const outPath = path.replace('/fixtures/', '/results/').replace(/\.[^/.]+$/, outExt)

  it(path, async () => {
    let result: TwoslashReturn = undefined!
    try {
      result = twoslasher(
        await fixture(),
        inExt,
        {
          customTags: ['annotate'],
        },
      )
    }
    catch (err: any) {
      if (expectThrows) {
        expect(err.message).toMatchFileSnapshot(outPath)
        return
      }
    }

    if (expectThrows) {
      throw new Error('Expected to throw')
    }

    else {
      expect(cleanFixture(result))
        .toMatchFileSnapshot(outPath)
    }
  })
})

function cleanFixture(ts: TwoslashReturn) {
  return JSON.stringify({
    code: ts.code,
    nodes: ts.nodes,
    flags: ts.meta.flagNotations,
    // compilerOptions: ts.meta.compilerOptions
  }, null, 2).replaceAll(process.cwd(), '[home]')
}
