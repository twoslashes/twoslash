import { expect, it } from 'vitest'
import { createTwoSlasher } from '../src/index'

const code = `
<script setup lang="ts">
import { ref, computed } from 'vue'

const count = ref(0)
const double = computed(() => count.value * 2)
//     ^?
</script>

<template>
  <button @click="count++">count is: {{ count }}</button>
</template>
`

const twoslasher = createTwoSlasher()

it('basic query', () => {
  const result = twoslasher(code, 'vue')

  expect(result.nodes.find(n => n.type === 'hover' && n.target === 'button'))
    .toHaveProperty('text', '(property) button: ButtonHTMLAttributes & ReservedProps')

  expect(result.nodes.find(n => n.type === 'hover' && n.target === 'click'))
    .toHaveProperty('text', '(property) \'click\': ((payload: MouseEvent) => void) | undefined')

  expect(result.nodes.find(n => n.type === 'query' && n.target === 'double'))
    .toHaveProperty('text', 'const double: ComputedRef<number>')
})
