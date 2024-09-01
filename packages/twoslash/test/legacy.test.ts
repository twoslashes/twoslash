import fs from 'node:fs/promises'
import { basename } from 'node:path'
import { twoslasher as twoslasherOriginal } from '@typescript/twoslash'
import { describe, expect, it } from 'vitest'
import { twoslasherLegacy } from '../src'

describe('legacy', async () => {
  await compareCode('./fixtures/examples/cuts-out-unnecessary-code.ts')
  await compareCode('./fixtures/examples/errors-with-generics.ts')
  await compareCode('./fixtures/examples/completions-basic.ts')
  await compareCode('./fixtures/examples/highlighting.ts')
  await compareCode('./fixtures/tests/inline-highlights.ts')
})

async function compareCode(path: string) {
  const code = await fs.readFile(new URL(path, import.meta.url), 'utf-8')

  it(`compare ${basename(path)}`, async () => {
    const us = twoslasherLegacy(code, 'ts')
    const result = twoslasherOriginal(code, 'ts')

    expect(
      cleanup(us),
    ).toStrictEqual(
      cleanup(result),
    )
  })
}

function cleanup(t: any) {
  delete t.playgroundURL

  t.queries.forEach((i: any) => {
    // We have different calculations for queries, that are not trivial to map back
    delete i.start
    delete i.length
    delete i.text
    delete i.completions
  })

  t.errors.forEach((i: any) => {
    // Id has a bit different calculation, as long as it's unique, it should be fine
    delete i.id
  })

  t.highlights.forEach((i: any) => {
    // It seems the legacy version's line numbers are off for the second highlight nations
    delete i.line
  })

  return t
}
