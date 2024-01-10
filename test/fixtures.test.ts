import fs from "node:fs/promises"
import { extname, join, parse } from "node:path"
import { describe, expect, it } from 'vitest'
import type { TwoSlashReturnNew } from "../src/types-new";
import { twoslasher } from "../src/index"

// To add a test, create a file in the fixtures folder and it will will run through
// as though it was the codeblock.

const fixturesFolder = join(__dirname, "fixtures")
const resultsFolder = join(__dirname, "results")

describe("fixtures", async () => {
  const fixturesTests = await fs.readdir(join(fixturesFolder, "tests"))

  await Promise.all(
    fixturesTests.map(async fixtureName => {
      const fixture = join(fixturesFolder, "tests", fixtureName)
      if (await fs.lstat(fixture).then(r => r.isDirectory())) {
        return
      }

      // if(!fixtureName.includes("imports")) return
      it(fixtureName, async () => {
        const resultName = `${parse(fixtureName).name}.json`
        const result = join(resultsFolder, "tests", resultName)

        const file = await fs.readFile(fixture, "utf8")

        const fourslashed = twoslasher(file, extname(fixtureName).substr(1), { customTags: ["annotate"] })
        expect(cleanFixture(fourslashed)).toMatchFileSnapshot(result)
      })
    })
  )
})

describe("fixtures readme", async () => {
  const fixturesRoot = await fs.readdir(join(fixturesFolder))

  await Promise.all(
    fixturesRoot.map(async fixtureName => {
      const fixture = join(fixturesFolder, fixtureName)
      if (await fs.lstat(fixture).then(r => r.isDirectory())) {
        return
      }

      // if(!fixtureName.includes("compiler_fl")) return
      it(fixtureName, async () => {
        const resultName = `${parse(fixtureName).name}.json`
        const result = join(resultsFolder, resultName)

        const file = await fs.readFile(fixture, "utf8")

        const fourslashed = twoslasher(file, extname(fixtureName).substr(1))
        expect(cleanFixture(fourslashed)).toMatchFileSnapshot(result)
      })
    })
  )

})

describe("fixtures throws", async () => {
  const throwingFixturesFolder = join(__dirname, "fixtures", "throws")
  const fixturesTrows = await fs.readdir(throwingFixturesFolder)

  await Promise.all(
    fixturesTrows.map(async fixtureName => {
      const fixture = join(throwingFixturesFolder, fixtureName)
      if (await fs.lstat(fixture).then(r => r.isDirectory())) {
        return
      }

      it(fixtureName, async () => {
        const resultName = `${parse(fixtureName).name}.json`
        const result = join(resultsFolder, resultName)

        const file = await fs.readFile(fixture, "utf8")

        let thrown = false
        try {
          twoslasher(file, extname(fixtureName).substr(1))
        } catch (err) {
          thrown = true
          if (err instanceof Error)
            expect(err.message).toMatchFileSnapshot(result)
        }

        if (!thrown) throw new Error("Did not throw")
      })
    })
  )
})

function cleanFixture(ts: TwoSlashReturnNew) {
  return JSON.stringify({
    code: ts.code,
    tokens: ts.tokens,
  }, null, 2).replaceAll(process.cwd(), "[home]")
}
