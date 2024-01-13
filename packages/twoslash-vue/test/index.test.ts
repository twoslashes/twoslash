import { expect, it } from 'vitest'
import { codeToHtml } from 'shikiji'
import { createTransformerFactory, rendererRich } from 'shikiji-twoslash/core'
import { createTwoSlasherVue } from '../src'

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

const styleHeader = [
  '<head>',
  `<link rel="stylesheet" href="https://esm.sh/shikiji-twoslash@0.9.18/style-rich.css" />`,
  `<style>:root { color-scheme: dark; --twoslash-popup-bg: #222; }</style>`,
  '</head>',
  '',
].join('\n')

const twoslasherVue = createTwoSlasherVue()

it('exported', () => {
  const result = twoslasherVue(code, 'vue')

  expect(result.nodes.slice(0, 10)).toMatchInlineSnapshot(`
    [
      {
        "character": 9,
        "docs": "Takes an inner value and returns a reactive and mutable ref object, which
    has a single property \`.value\` that points to the inner value.",
        "length": 3,
        "line": 2,
        "start": 35,
        "target": "ref",
        "text": "(alias) function ref<T>(value: T): Ref<UnwrapRef<T>> (+1 overload)
    import ref",
        "type": "hover",
      },
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
        "type": "hover",
      },
      {
        "character": 6,
        "docs": undefined,
        "length": 5,
        "line": 4,
        "start": 69,
        "target": "count",
        "text": "const count: Ref<number>",
        "type": "hover",
      },
      {
        "character": 14,
        "docs": "Takes an inner value and returns a reactive and mutable ref object, which
    has a single property \`.value\` that points to the inner value.",
        "length": 3,
        "line": 4,
        "start": 77,
        "target": "ref",
        "text": "(alias) ref<number>(value: number): Ref<number> (+1 overload)
    import ref",
        "type": "hover",
      },
      {
        "character": 6,
        "docs": undefined,
        "length": 6,
        "line": 5,
        "start": 90,
        "target": "double",
        "text": "const double: ComputedRef<number>",
        "type": "hover",
      },
      {
        "character": 7,
        "docs": undefined,
        "length": 6,
        "line": 5,
        "start": 91,
        "target": "double",
        "text": "const double: ComputedRef<number>",
        "type": "query",
      },
      {
        "character": 15,
        "docs": "Takes a getter function and returns a readonly reactive ref object for the
    returned value from the getter. It can also take an object with get and set
    functions to create a writable ref object.",
        "length": 8,
        "line": 5,
        "start": 99,
        "target": "computed",
        "text": "(alias) computed<number>(getter: ComputedGetter<number>, debugOptions?: DebuggerOptions | undefined): ComputedRef<number> (+1 overload)
    import computed",
        "type": "hover",
      },
      {
        "character": 30,
        "docs": undefined,
        "length": 5,
        "line": 5,
        "start": 114,
        "target": "count",
        "text": "const count: Ref<number>",
        "type": "hover",
      },
      {
        "character": 36,
        "docs": undefined,
        "length": 5,
        "line": 5,
        "start": 120,
        "target": "value",
        "text": "(property) Ref<number>.value: number",
        "type": "hover",
      },
      {
        "character": 3,
        "docs": undefined,
        "length": 6,
        "line": 9,
        "start": 156,
        "target": "button",
        "text": "(property) button: ButtonHTMLAttributes & ReservedProps",
        "type": "hover",
      },
    ]
  `)
})

it('highlight vue', async () => {
  const result = await codeToHtml(code, {
    lang: 'vue',
    theme: 'vitesse-dark',
    transformers: [
      createTransformerFactory(twoslasherVue)({
        langs: ['ts', 'tsx', 'vue'],
        renderer: rendererRich({
          lang: 'ts',
        }),
      }),
    ],
  })

  expect(styleHeader + result)
    .toMatchFileSnapshot('./out/example.vue.html')
})

const twoslasherRaw = createTwoSlasherVue(undefined, false)
it('highlight raw', async () => {
  const result = await codeToHtml(code, {
    lang: 'ts',
    theme: 'vitesse-dark',
    transformers: [
      createTransformerFactory((code, _, opt) => twoslasherRaw(code, 'vue', opt))({
        langs: ['ts', 'tsx', 'vue'],
        renderer: rendererRich({
          lang: 'ts',
        }),
      }),
    ],
  })

  expect(styleHeader + result)
    .toMatchFileSnapshot('./out/example.raw.html')
})
