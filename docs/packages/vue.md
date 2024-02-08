# Twoslash Vue

This package added the support for Twoslash to handle Vue Single File Component files.

For example:

```vue twoslash
<script setup>
import { onMounted, ref } from 'vue'
//                   ^?

// Reactive state.
const count = ref(0)

// Functions that mutate state and trigger updates.
function increment() {
  count.value++
}

// Lifecycle hooks.
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
import { createTwoslasher } from 'twoslash' // [!code --]
import { createTwoslasher } from 'twoslash-vue' // [!code ++]

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

const twoslasher = createTwoslasher()
const result = twoslasher(code, 'vue') // [!code hl]
```
