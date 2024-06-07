import ts from 'typescript'
import { expect, it } from 'vitest'
import { getIdentifierTextSpans, removeTsExtension } from '../src/utils.js'

it('gets the expected identifiers', () => {
  const file = ts.createSourceFile(
    'anything.ts',
    `
readdirSync(fixturesFolder).forEach(fixtureName => {
  const fixture = join(fixturesFolder, fixtureName)
  if (lstatSync(fixture).isDirectory()) {
    return
  }

  // if(!fixtureName.includes("compiler_fl")) return
  it('Fixture: ' + fixtureName, () => {
    const resultName = parse(fixtureName).name + '.json'
    const result = join(resultsFolder, resultName)

    const file = readFileSync(fixture, 'utf8')

    const fourslashed = twoslasher(file, extname(fixtureName).substr(1))
    const jsonString = format(JSON.stringify(fourslashed), { parser: 'json' })
    expect(jsonString).toMatchFile(result)
  })
})
  `,
    ts.ScriptTarget.ES2015,
  )

  const allIdentifiers = getIdentifierTextSpans(ts, file, 0)
  expect(allIdentifiers.length).toEqual(40)
})

it('reduces filenames down', () => {
  expect(removeTsExtension('foo.ts')).toEqual('foo')
  expect(removeTsExtension('foo.tsx')).toEqual('foo')
  expect(removeTsExtension('foo.d.ts')).toEqual('foo')
  expect(removeTsExtension('foo.js.map')).toEqual('foo')
  expect(removeTsExtension('foo')).toEqual('foo')
  expect(removeTsExtension('foo.vue')).toEqual('foo')
})
