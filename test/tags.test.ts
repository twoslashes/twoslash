import { expect, it } from 'vitest'
import { twoslasher } from "../src/index"

it("extracts custom tags", () => {
  const file = `
// @thing: OK, sure
const a = "123"
// @thingTwo - This should stay (note the no ':')
const b = 12331234
  `
  const result = twoslasher(file, "ts", { customTags: ["thing"] })
  expect(result.tags.length).toEqual(1)

  expect(result.code).toMatchInlineSnapshot(`
    "
    const a = "123"
    // @thingTwo - This should stay (note the no ':')
    const b = 12331234
      "
  `)

  const tag = result.tags[0]
  expect(tag).toMatchInlineSnapshot(`
    {
      "annotation": "OK, sure",
      "character": 0,
      "length": 0,
      "line": 2,
      "name": "thing",
      "offset": 1,
      "type": "tag",
    }
  `)
})

it("removes tags which are cut", () => {
  const file = `
// @thing: OK, sure
const a = "123"
// ---cut---
// @thing: This one only
const another = ''
    `
  const result = twoslasher(file, "ts", { customTags: ["thing"] })
  expect(result.tags.length).toEqual(1)

  expect(result.code).toMatchInlineSnapshot(`
    "// @thing: This one only
    const another = ''
        "
  `)

  const tag = result.tags[0]
  expect(tag).toMatchInlineSnapshot(`
    {
      "annotation": "This one only",
      "character": 0,
      "length": 0,
      "line": 1,
      "name": "thing",
      "offset": 0,
      "type": "tag",
    }
  `)
})
