import { describe, expect, it } from 'vitest'
import { createTwoslasher } from '../src/index'

const code = `
<script setup lang="ts">
import { ref, computed } from 'vue'
//             ^?

const count = ref(0)
const double = computed(() => count.value * 2)
//     ^?
</script>

<template>
  <button @click="count++">count is: {{ count }}</button>
//           ^?
</template>
`

const twoslasher = createTwoslasher()

describe('basic', () => {
  const result = twoslasher(code, 'vue')

  it('has correct hover types', () => {
    expect(result.nodes.find(n => n.type === 'hover' && n.target === 'button'))
      .toHaveProperty('text', '(property) button: ButtonHTMLAttributes & ReservedProps')
    expect(result.nodes.find(n => n.type === 'hover' && n.target === 'click'))
      .toHaveProperty('text', '(property) \'click\': ((payload: MouseEvent) => void) | undefined')
  })

  it('has correct query', () => {
    expect(result.meta.positionQueries)
      .toMatchInlineSnapshot(`
        [
          38,
          235,
          1970,
        ]
      `)

    expect(result.nodes.find(n => n.type === 'query' && n.target === 'double'))
      .toHaveProperty('text', 'const double: ComputedRef<number>')

    expect(result.nodes.find(n => n.type === 'query' && n.target === 'computed'))
      .toMatchInlineSnapshot(`
        {
          "character": 14,
          "docs": undefined,
          "length": 8,
          "line": 2,
          "start": 40,
          "target": "computed",
          "text": "(alias) const computed: {
            <T>(getter: ComputedGetter<T>, debugOptions?: DebuggerOptions | undefined): ComputedRef<T>;
            <T>(options: WritableComputedOptions<T>, debugOptions?: DebuggerOptions | undefined): WritableComputedRef<...>;
        }
        import computed",
          "type": "query",
        }
      `)

    // TODO: support this, and also it should throw an error if it's not found
    // expect(result.nodes.find(n => n.type === 'query' && n.target === 'click'))
    //   .toMatchInlineSnapshot(`undefined`)
    // expect(result.nodes.filter(n => n.type === 'query'))
    //   .toHaveLength(3)
  })
})
