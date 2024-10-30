# Twoslash Svelte

This package added the support for Twoslash to handle Svelte Single File Component files.

For example:

```svelte
<script>
    import { onMount } from 'svelte'

    let count = $state(0)
    function increment() {
        count++
    }
</script>

<button onclick={increment}>
    Count is: {count}
</button>
```

## Installation

::: code-group

```bash [npm]
npm i -D twoslash-svelte
```
```bash [pnpm]
pnpm i -D twoslash-svelte
```
```bash [yarn]
yarn add -D twoslash-svelte
```
```bash [bun]
bun add -D twoslash-svelte
```

:::

## Usage

```ts twoslash
// @noErrors
import { createTwoslasher } from 'twoslash' // [!code --]
import { createTwoslasher } from 'twoslash-svelte' // [!code ++]

const code = `
<script>
  const msg = 'Hello Svelte!'
</script>

<div>
<h1>{msg}</h1>
</div>
`

const twoslasher = createTwoslasher()
const result = twoslasher(code, 'svelte') // [!code hl]
```
