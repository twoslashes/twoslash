# Migration Guide

Migrating from [`@typescript/twoslash`](https://github.com/microsoft/TypeScript-Website/tree/v2/packages/ts-twoslasher).

Consider `twoslash` as the successor of `@typescript/twoslash` that maintained and driven by the community. It has been rewritten to provide better performance and more flexible APIs.

## Breaking Changes

Breaking changes from `@typescript/twoslash`:

1. The returned items have different signatures, and different types of the items (`staticQuickInfo`, `queries`, `errors`, `tags`) are now unified into a single array `nodes`. Learn more at the [Information Nodes](/refs/result#information-nodes) section.
2. Main entry point `import {} from "twoslash"` dependent on `typescript` package, while a new sub-entry `import {} from "twoslash/core"` is dependency-free and requires providing your own TypeScript instance.
3. `defaultOptions` is renamed to `handbookOptions`.
4. `defaultCompilerOptions` is renamed to `compilerOptions`.
5. The default `compilerOptions` is set to `target: "esnext"` instead of `target: "es5"`, [learn more](https://github.com/twoslashes/twoslash/blob/main/packages/twoslash/src/defaults.ts).
5. [`playgroundURL` is removed](#playground-url)

### Compatibility Layer

To make it easier to migrate from `@typescript/twoslash`, we provided a backward compatibility layer that allows you to use the old interface with the new implementation.

```ts twoslash
import { twoslasherLegacy } from 'twoslash'

const result = twoslasherLegacy('import { ref } from "vue"', 'ts')

console.log(result.staticQuickInfos) // the old interface
```

You can also compose it yourself by only converting the return value:

```ts twoslash
import { convertLegacyReturn, twoslasher } from 'twoslash'

const result = twoslasher('import { ref } from "vue"', 'ts') // new interface

const legacy = convertLegacyReturn(result) // <--

console.log(legacy.staticQuickInfos) // the old interface
```

### Playground URL

Playground URL is removed from the result as for integration usage it's often redundant. If needed, you can calculate it yourself by the following snippet:

```ts twoslash
declare const code: string
// ---cut---
import lzString from 'lz-string'

const zipped = lzString.compressToEncodedURIComponent(code)
const playgroundURL = `https://www.typescriptlang.org/play/#code/${zipped}`
```
