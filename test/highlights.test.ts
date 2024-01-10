import { twoslasher } from "../src/index"
import { expect, it } from 'vitest'

it("supports highlighting something", () => {
  const file = `
const a = "123"
//    ^^^^^^^^^
const b = "345"
`
  const result = twoslasher(file, "ts")
  expect(result.highlights.length).toEqual(1)
})
