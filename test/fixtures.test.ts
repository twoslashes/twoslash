import fs from 'node:fs/promises'
import { extname, join, parse } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import type { TwoSlashReturn } from '../src/types'
import { createTwoSlasher } from '../src/index'
import { FEAT_SHOW_EMIT } from './FEATURES'

const isWindows = process.platform === 'win32'

// To add a test, create a file in the fixtures folder and it will will run through
// as though it was the codeblock.

const fixturesFolder = join(__dirname, 'fixtures')
const resultsFolder = join(__dirname, 'results')

const twoslasher = createTwoSlasher()

describe.skipIf(isWindows)('fixtures', async () => {
  const fixturesTests = await fs.readdir(join(fixturesFolder, 'tests'))

  await Promise.all(
    fixturesTests.map(async (fixtureName): Promise<void> => {
      const fixture = join(fixturesFolder, 'tests', fixtureName)
      if (await fs.lstat(fixture).then(r => r.isDirectory()))
        return

      // if(!fixtureName.includes("imports")) return
      it(fixtureName, async () => {
        const resultName = `${parse(fixtureName).name}.json`
        const file = await fs.readFile(fixture, 'utf8')

        if (!FEAT_SHOW_EMIT && file.includes('@showEmit'))
          return

        const fourslashed = twoslasher(file, extname(fixtureName).substr(1), {
          customTags: ['annotate'],
        })
        expect(cleanFixture(fourslashed))
          .toMatchFileSnapshot(join(resultsFolder, 'tests', resultName))
      })
    }),
  )
})

describe('fixtures examples', async () => {
  const fixturesFolder = join(__dirname, 'fixtures', 'examples')
  const fixturesRoot = await fs.readdir(join(fixturesFolder))

  await Promise.all(
    fixturesRoot.map(async (fixtureName) => {
      const fixture = join(fixturesFolder, fixtureName)
      if (await fs.lstat(fixture).then(r => r.isDirectory()))
        return

      // if(!fixtureName.includes("compiler_fl")) return
      it(fixtureName, async () => {
        const resultName = `${parse(fixtureName).name}.json`

        const file = await fs.readFile(fixture, 'utf8')
        if (!FEAT_SHOW_EMIT && file.includes('@showEmit'))
          return

        const fourslashed = twoslasher(file, extname(fixtureName).substr(1))
        expect(cleanFixture(fourslashed))
          .toMatchFileSnapshot(join(resultsFolder, 'examples', resultName))
      })
    }),
  )
})

describe('fixtures throws', async () => {
  const throwingFixturesFolder = join(__dirname, 'fixtures', 'throws')
  const fixturesTrows = await fs.readdir(throwingFixturesFolder)

  await Promise.all(
    fixturesTrows.map(async (fixtureName) => {
      const fixture = join(throwingFixturesFolder, fixtureName)
      if (await fs.lstat(fixture).then(r => r.isDirectory()))
        return

      it(fixtureName, async () => {
        const resultName = `${parse(fixtureName).name}.txt`

        const file = await fs.readFile(fixture, 'utf8')

        let thrown = false
        try {
          twoslasher(file, extname(fixtureName).substr(1))
        }
        catch (err) {
          thrown = true
          if (err instanceof Error)
            expect(err.message).toMatchFileSnapshot(join(resultsFolder, 'throws', resultName))
        }

        if (!thrown)
          throw new Error('Did not throw')
      })
    }),
  )
})

function cleanFixture(ts: TwoSlashReturn) {
  return JSON.stringify({
    code: ts.code,
    tokens: ts.tokens,
    // compilerOptions: ts.meta.compilerOptions
  }, null, 2).replaceAll(process.cwd(), '[home]')
}
