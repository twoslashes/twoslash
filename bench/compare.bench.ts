/* eslint-disable import/first */
process.env.NODE_ENV = 'production'

import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import { basename } from 'node:path'
import { bench, describe } from 'vitest'
import fg from 'fast-glob'
import { twoslasher as twoslasherOld } from '@typescript/twoslash'
import { createTwoslasher } from 'twoslash'

const codes = await fg([
  'examples/*.ts',
  'tests/*.ts',
], {
  cwd: fileURLToPath(new URL('../packages/twoslash/test/fixtures', import.meta.url)),
  onlyFiles: true,
  absolute: true,
})
  .then(files => Promise.all(files.sort().map(async file => [file, await fs.readFile(file, 'utf8')])))
  .then(i => i.filter(i => !i[1].includes('@showEmit')))

// eslint-disable-next-line no-console
console.log(`Running benchmarks with ${codes.length} examples`)

const options = {
  customTags: ['annotate'],
}

const twoslash = createTwoslasher(options)

for (const [file, code] of codes) {
  describe(basename(file), () => {
    bench('twoslash', () => {
      twoslash(code, 'ts')
    })

    // bench('twoslash (direct)', () => {
    //   twoslasher(code, 'ts', options)
    // })

    bench('@typescript/twoslash', () => {
      twoslasherOld(code, 'ts', options)
    })
  })
}
