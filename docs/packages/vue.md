# Twoslash Vue

This package added the support for Twoslash to handle Vue Single File Component files.

For example:

```vue twoslash
<script setup>
import { onMounted, ref } from 'vue'
//                   ^?

// reactive state
const count = ref(0)

// functions that mutate state and trigger updates
function increment() {
  count.value++
}

// lifecycle hooks
onMounted(() => {
  console.log(`The initial count is ${count.value}.`)
})
</script>

<template>
  <button @click="increment">
    Count is: {{ count }}
  </button>
</template>
```

## Installation

::: code-group

```bash [npm]
npm i -D twoslash-vue
```
```bash [pnpm]
pnpm i -D twoslash-vue
```
```bash [yarn]
yarn add -D twoslash-vue
```
```bash [bun]
bun add -D twoslash-vue
```

:::

## Usage

```ts twoslash
// @noErrors
import { createTwoSlasher } from 'twoslash' // [!code --]
import { createTwoSlasher } from 'twoslash-vue' // [!code ++]

const code = `
<script setup>
const msg = 'Hello Vue 3!'
</script>

<template>
  <div>
    <h1>{{ msg }}</h1>
  </div>
</template>
`

const twoslasher = createTwoSlasher()
const result = twoslasher(code, 'vue') // [!code hl]
```
