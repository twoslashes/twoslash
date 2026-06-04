---
outline: deep
---

# Twoslash ESLint

This package provides a [ESLint](https://eslint.org/)-backed Twoslasher runner. Instead of checking for types, it converts ESLint diagnostics into Twoslash compatible interface and present ESLint warning and errors.

For example:

<!-- eslint-skip -->

```ts eslint-check
const unused = 1

type Foo = {
  bar: string
}
```

## Installation

::: code-group

```bash [npm]
npm i -D twoslash-eslint
```
```bash [pnpm]
pnpm i -D twoslash-eslint
```
```bash [yarn]
yarn add -D twoslash-eslint
```
```bash [bun]
bun add -D twoslash-eslint
```

:::

## Usage

```ts twoslash
import { createTwoslasher } from 'twoslash-eslint'

const code = `
console.log('Code to lint')
`

const twoslasher = createTwoslasher({
  // Provide the ESLint FlatConfig array here
  eslintConfig: [
    {
      files: ['**'],
      plugins: { /* ... */ },
      rules: { /* ... */ }
    }
  ]
})

const result = twoslasher(code, 'index.ts')
```

### Usage with Shiki

If you are using [`@shikijs/twoslash`](https://shiki.style/packages/twoslash) and want to support both TypeScript Twoslash and ESLint TwoSlash, you can use the following code:

```ts twoslash
// @noErrors
import Shiki from '@shikijs/markdown-it'
import { transformerTwoslash } from '@shikijs/twoslash'
import { createTwoslasher as createTwoslasherESLint } from 'twoslash-eslint'

const shikiPlugin = await Shiki({
  theme: 'vitesse-light',
  // Or any other integrations that support passing Shiki transformers
  transformers: [
    // This is for normal TypeScript Twoslash
    transformerTwoslash({
      explicitTrigger: /\btwoslash\b/,
    }),
    // Create another transformer, but with different trigger and ESLint twoslasher // [!code hl:13]
    transformerTwoslash({
      explicitTrigger: /\beslint-check\b/,
      // Pass the custom twoslasher
      twoslasher: createTwoslasherESLint({
        eslintConfig: [
          // ESLint flat config items here
        ]
      }),
      rendererRich: {
        // Use hover to render errors instead of inserting a error line
        // Up to your preference
        errorRendering: 'hover',
      }
    }),
  ]
})
```

And then you can have the following code in your markdown:

````md
```ts twoslash
console.log('normal typescript twoslash')
```

```ts eslint-check
console.log('normal eslint twoslash')
```
````
