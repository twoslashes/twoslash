import fs from 'node:fs/promises'
import { basename } from 'node:path'
import { twoslasher as twoslasherOriginal } from '@typescript/twoslash'
import { describe, expect, it } from 'vitest'
import { twoslasherLegacy } from '../src'

describe('legacy', async () => {
  await compareCode('./fixtures/examples/cuts_out_unnecessary_code.ts')
  await compareCode('./fixtures/examples/errorsWithGenerics.ts')
  await compareCode('./fixtures/examples/completions.ts')

  async function compareCode(path: string) {
    const code = await fs.readFile(new URL(path, import.meta.url), 'utf-8')

    it(`compare ${basename(path)}`, async () => {
      const us = twoslasherLegacy(code, 'ts')
      const result = twoslasherOriginal(code, 'ts')

      function cleanup(t: any) {
        delete t.playgroundURL

        // We have different calculations for queries, that are not trivial to map back
        t.queries.forEach((i: any) => {
          delete i.start
          delete i.length
          delete i.text
          delete i.completions
        })

        t.errors.forEach((i: any) => {
          delete i.id
        })

        return t
      }

      expect(
        cleanup(us),
      ).toStrictEqual(
        cleanup(result),
      )
    })
  }
})
