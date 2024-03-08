import { expect, it } from 'vitest'
import { twoslasher } from '../src/index'

it('supports highlighting something', async () => {
  const file = `
const a = "123"
//    ^^^^^^^^^
const b = "345"
`
  const result = await twoslasher(file, 'ts')
  expect(result.highlights.length).toEqual(1)
})
