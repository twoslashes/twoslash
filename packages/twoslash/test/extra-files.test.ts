import { describe, expect, it } from 'vitest'
import { twoslasher } from '../src/index.js'

describe('supports extra-files', () => {
  it('prepend & append', () => {
    const file = `
const a = ref(1)
    `.trim()
    const result = twoslasher(file, 'ts', {
      extraFiles: {
        'index.ts': {
          prepend: 'function ref<T>(value: T): Ref<T> { return { value } }\n',
          append: '\ninterface Ref<T> { value: T }',
        },
      },
    })

    expect(result.code).toEqual(file)

    expect(result.nodes.find(n => n.type === 'hover' && n.target === 'ref'))
      .toMatchInlineSnapshot(`
        {
          "character": 10,
          "docs": undefined,
          "length": 3,
          "line": 0,
          "start": 10,
          "tags": undefined,
          "target": "ref",
          "text": "function ref<number>(value: number): Ref<number>",
          "type": "hover",
        }
      `)
  })

  it('extra file', () => {
    const file = `
import { ref } from './foo'
const a = ref(1)
a.value = 'foo'
    `.trim()

    const result = twoslasher(file, 'ts', {
      extraFiles: {
        'foo.ts': 'export function ref<T>(value: T): Ref<T> { return { value } }\ninterface Ref<T> { value: string }',
      },
    })

    expect(result.code).toEqual(file)

    expect(result.nodes.findLast(n => n.type === 'hover' && n.target === 'ref'))
      .toMatchInlineSnapshot(`
        {
          "character": 10,
          "docs": undefined,
          "length": 3,
          "line": 1,
          "start": 38,
          "tags": undefined,
          "target": "ref",
          "text": "(alias) ref<number>(value: number): Ref<number>
        import ref",
          "type": "hover",
        }
      `)
  })
})
