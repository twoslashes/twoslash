/* eslint-disable import/first */
process.env.NODE_ENV = 'production'

/* eslint-disable test/consistent-test-it */
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import { basename } from 'node:path'
import { bench, describe } from 'vitest'
import fg from 'fast-glob'
import { twoslasher as twoslasherOld } from '@typescript/twoslash'
import { createTwoSlasher, twoslasher } from 'twoslashes'

const codes = await fg([
  'examples/*.ts',
  'tests/*.ts',
], {
  cwd: fileURLToPath(new URL('../test/fixtures', import.meta.url)),
  onlyFiles: true,
  absolute: true
})
  .then((files) => Promise.all(files.sort().map(async (file) => [file, await fs.readFile(file, 'utf8')])))
  .then(i => i.filter(i => !i[1].includes('@showEmit')))

// eslint-disable-next-line no-console
console.log(`Running benchmarks with ${codes.length} examples`)

const options = {
  customTags: ["annotate"]
}

const twoslash = createTwoSlasher(options)

for (const [file, code] of codes) {
  describe(basename(file), () => {
    bench('twoslashes', () => {
      twoslash(code, 'ts')
    })

    // bench('twoslashes (direct)', () => {
    //   twoslasher(code, 'ts', options)
    // })

    bench('@typescript/twoslash', () => {
      twoslasherOld(code, 'ts', options)
    })
  })
}
