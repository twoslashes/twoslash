# Migration Guide

Mirgrating from [`@typescript/twoslash`](https://github.com/microsoft/TypeScript-Website/tree/v2/packages/ts-twoslasher).

Consider `twoslash` as the successor of `@typescript/twoslash` that maintained and driven by the community. It has been rewritten to provide better performance and more flexible APIs.

## Breaking Changes

Breaking changes from `@typescript/twoslash`:

1. The returned items have different signatures, and different types of the items (`staticQuickInfo`, `queries`, `errors`, `tags`) are now unified into a single array `nodes`. Learn more at the [Information Nodes](#information-nodes) section.
2. Main entry point `import "twoslash"` imports `typescript`, while a new sub-entry `import "twoslash/core"` is dependency-free and requires providing your own typescript instance.
3. `defaultOptions` is renamed to `handbookOptions`
4. `defaultCompilerOptions` is renamed to `compilerOptions`
5. `playgroundURL` is removed

### Compatibility Layer

To make it easier to migrate from `@typescript/twoslash`, we provided a backward compatibility layer that allows you to use the old interface with the new implementation.

```ts twoslash
import { twoslasherLegacy } from 'twoslash'

const result = twoslasherLegacy('import { ref } from "vue"', 'ts')

console.log(result.staticQuickInfos) // the old interface
```

You can also compose it your own by only converting the return value:

```ts twoslash
import { convertLegacyReturn, twoslasher } from 'twoslash'

const result = twoslasher('import { ref } from "vue"', 'ts') // new interface

const legacy = convertLegacyReturn(result) // <--

console.log(legacy.staticQuickInfos) // the old interface
```
