# Installation

The package `twoslash` is relatively a low-level tool that generating raw type information for the given TypeScript code snippets. **This page will force on low-level programtic usages**. If you are looking for a higher-level tool, check the [integrations](/guide/integrations) section.

To install the `twoslash` package, run the following command:

::: code-group

```bash [npm]
npm i -D twoslash
```

```bash [pnpm]
pnpm i -D twoslash
```

```bash [yarn]
yarn add -D twoslash
```

```bash [bun]
bun add -D twoslash
```

:::

## Usage

To use it, you can call the `createTwoSlasher` function to create a TwoSlash instance where it will cache the TypeScript language service internally for better performance:

```ts twoslash
import { createTwoSlasher } from 'twoslash'

const code = `let a = 'hello'.toUpperCase()`

const twoslasher = createTwoSlasher()
const result = twoslasher(code)
```

It will outputs a JavaScript object that contains static type information for each identifier in the code:

```ts eval
import { createTwoSlasher } from 'twoslash'

const code = `let a = 'hello'.toUpperCase()`

const twoslasher = createTwoSlasher()
const result = twoslasher(code)

console.log({
  code: result.code,
  nodes: result.nodes,
})
```

With this, you can render the code snippets how you want. Or, you can check the [Syntax Highlighting](/guide/highlight) section to see how you use it along with a tool like Shiki to get beautiful syntax highlighting.
