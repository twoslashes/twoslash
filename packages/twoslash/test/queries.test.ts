import { expect, it } from 'vitest'
import { createTwoslasher } from '../src/index'

const twoslasher = createTwoslasher()

it('works in a trivial case', () => {
  const file = `
const a = "123"
//    ^?
  `
  const result = twoslasher(file, 'ts')
  const bQueryResult = result.queries.find(info => info.line === 1)

  expect(bQueryResult).toBeTruthy()
  expect(bQueryResult!.text).toContain('const a')
})

it('supports carets in the middle of an identifier', () => {
  const file = `
const abc = "123"
//     ^?
  `
  const result = twoslasher(file, 'ts')
  const bQueryResult = result.queries.find(info => info.line === 1)
  expect(bQueryResult!.text).toContain('const abc')
})

it('supports two queries', () => {
  const file = `
const a = "123"
//    ^?
const b = "345"
//    ^?
  `
  const result = twoslasher(file, 'ts')

  const aQueryResult = result.queries.find(info => info.line === 1)
  expect(aQueryResult!.text).toContain('const a:')

  const bQueryResult = result.queries.find(info => info.line === 2)
  expect(bQueryResult!.text).toContain('const b:')
})

it('supports many queries', () => {
  const file = `
const a = "123"
//    ^?
const b = "345"
//    ^?
// A comment to throw things off
let c = "789"
//  ^? 
  `
  const result = twoslasher(file, 'ts')
  expect(result.queries.length).toEqual(3)

  const aQueryResult = result.queries.find(info => info.line === 1)
  expect(aQueryResult!.text).toContain('const a:')

  const bQueryResult = result.queries.find(info => info.line === 2)
  expect(bQueryResult!.text).toContain('const b:')

  const cQueryResult = result.queries.find(info => info.line === 4)
  expect(cQueryResult!.text).toContain('let c:')
})

it('supports queries across many files', () => {
  const file = `
// @filename: index.ts
const a = "123"
//    ^?
// @filename: main-file-queries.ts
const b = "345"
//    ^? 
  `
  const result = twoslasher(file, 'ts')

  const aQueryResult = result.queries.find(info => info.line === 2)
  expect(aQueryResult!.text).toContain('const a:')

  const bQueryResult = result.queries.find(info => info.line === 4)
  expect(bQueryResult!.text).toContain('const b:')
})

it('supports carets should be relative to token', () => {
  const file1 = `
const abc = "123"
//     ^?
  `
  const file2 = `
const abc = "123"
//    ^?
  `

  const result1 = twoslasher(file1, 'ts')
  const result2 = twoslasher(file2, 'ts')
  expect(
    result1.queries,
  ).toEqual(
    result2.queries,
  )
})
