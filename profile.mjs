// Run `node --inspect-brk profile.mjs` and open `chrome://inspect` in Chrome

import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import fg from 'fast-glob'
import { twoslasher } from 'twoslashes'
import { twoslasher as old } from '@typescript/twoslash'

const codes = await fg(['examples/*.ts', 'tests/*.ts'], {
  cwd: fileURLToPath(new URL('./test/fixtures', import.meta.url)),
  onlyFiles: true,
  absolute: true,
})
  .then(files => Promise.all(files.sort().map(file => fs.readFile(file, 'utf8'))))
  .then(i => i.filter(i => !i.includes('@showEmit')))

// eslint-disable-next-line no-console
console.log(`Running benchmarks with ${codes.length} examples`)

const options = {
  customTags: ['annotate'],
}

const index = 0

// warm up
twoslasher(codes[index], 'ts', options)
old(codes[index], 'ts', options)

// profile
await new Promise(resolve => setTimeout(resolve, 300))
twoslasher(codes[index], 'ts', options)
await new Promise(resolve => setTimeout(resolve, 300))
old(codes[index], 'ts', options)
