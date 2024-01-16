# API References

## `createTwoslasher`

Twoslash runs a TypeScript language server to get the information, which could be a heavy operation to load and parse all the files it needs. In repetitive usages, you may not want to initialize the language server every simple time. Twoslash provides a `createTwoslasher` factory function allows you to cache the language servers and reuse the already initialized files.

```ts
import { createTwoslasher } from 'twoslash'

const twoslasher = createTwoslasher({
  // you can have some default options here
})

const result1 = twoslasher('import { ref } from "vue"', 'ts')
// the second time will be much faster as the types from `vue` is already
const result2 = twoslasher('import { computed } from "vue"', 'ts')
```

This would result in a [5-20 times faster](#benchmark) performance in repetitive usage.

To avoid getting interference across runs, it will reuse the language server with the same `compilerOptions`. Internally it holds a map of hashed `compilerOptions` to the language server instances.

You can retrieve the cached map and clear it when necessary, to avoid memory leaks:

```ts
import { createTwoslasher } from 'twoslash'

const twoslasher = createTwoslasher()

// do something

// Clear the cached language servers, free the memory
twoslasher.getCacheMap()?.clear()
```

## `twoslasher`

// TODO:

## `twoslasherLegacy`

// TODO:
