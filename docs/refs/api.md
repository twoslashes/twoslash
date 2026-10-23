# API References

## `createTwoslasher`

Twoslash runs a TypeScript language server to get the information, which could be a heavy operation to load and parse all the files it needs. In repetitive usages, you may not want to initialize the language server every simple time. Twoslash provides a `createTwoslasher` factory function allows you to cache the language servers and reuse the already initialized files.

```ts twoslash
import { createTwoslasher } from 'twoslash'

const twoslasher = createTwoslasher({
  // ...your custom options.
})

const result1 = twoslasher('import { ref } from "vue"', 'ts')
// The second time will be much faster as the types from `vue` is already.
const result2 = twoslasher('import { computed } from "vue"', 'ts')
```

This would result in a 5-20 times faster performance in repetitive usage.

To avoid getting interference across runs, it will reuse the language server with the same `compilerOptions`. Internally it holds a map of hashed `compilerOptions` to the language server instances.

You can retrieve the cached map and clear it when necessary, to avoid memory leaks:

```ts twoslash
import { createTwoslasher } from 'twoslash'

const twoslasher = createTwoslasher()

// Do something...

// Clear the cached language servers, free the memory.
twoslasher.getCacheMap()?.clear()
```

## `createTwoslasherAsync`

TypeScript 7 is written in Go and no longer ships the JavaScript language service, so Twoslash talks to its native language server instead. That communication is asynchronous, which `createTwoslasherAsync` handles. It works with TypeScript 5 and 6 as well, so you can switch to it before upgrading.

```ts twoslash
import { createTwoslasherAsync } from 'twoslash'

const twoslasher = createTwoslasherAsync()

const result = await twoslasher('import { ref } from "vue"', 'ts')

// Stop the language server when you are done, otherwise it keeps the process alive.
await twoslasher.close()
```

Calls are processed one at a time. With TypeScript 7, some features behave differently:

- `@showEmit` is not supported, since the language server does not expose emitted output.
- Virtual files (`// @filename: src/foo.ts`) must be in directories that exist on disk.
- Compiler options that TypeScript 7 removed (like `baseUrl` or `moduleResolution: node`) throw an error.
- Hover texts follow the TypeScript 7 output, e.g. union members can be ordered differently.

## `twoslasher`

The `twoslasher` function is a shorthand for directly getting the result from the code. It will create a new TypeScript language server every time it is called. Ideally, `createTwoslasher` should be preferred.

```ts twoslash
import { twoslasher } from 'twoslash'

const code = `console.log("Hello World")`
const result = twoslasher(code, 'ts', { /* options */ })
```

## `twoslasherLegacy`

The `twoslasherLegacy` function is provided to make the migration from `@typescript/twoslash` easier by converting the new result to the legacy format, learn more at [Compatibility Layer](/guide/migrate#compatibility-layer) sections.
