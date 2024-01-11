/* eslint-disable test/consistent-test-it */
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import { bench, describe } from 'vitest'
import fg from 'fast-glob'
import { twoslasher as twoslasherOld } from '@typescript/twoslash'
import { createTwoSlasher, twoslasher } from 'twoslashes'

describe('compare', async () => {
  const codes = await fg([
    'examples/*.ts',
    'tests/*.ts',
  ], {
    cwd: fileURLToPath(new URL('../test/fixtures', import.meta.url)),
    onlyFiles: true,
    absolute: true
  })
    .then((files) => Promise.all(files.map((file) => fs.readFile(file, 'utf8'))))
    .then(i => i.filter(i => !i.includes('@showEmit')))

  // eslint-disable-next-line no-console
  console.log(`Running benchmarks with ${codes.length} examples`)

  const options = {
    customTags: ["annotate"]
  }

  bench('twoslashes (instance)', () => {
    const twoslash = createTwoSlasher(options)
    codes.forEach((code) => {
      twoslash(code, 'ts')
    })
  })

  bench('twoslashes (direct)', () => {
    codes.forEach((code) => {
      twoslasher(code, 'ts', options)
    })
  })

  bench('@typescript/twoslash', () => {
    codes.forEach((code) => {
      twoslasherOld(code, 'ts', options)
    })
  })
})
