# TwoSlash

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

> [!NOTE]
> Working in progress, breaking changes are expected.

A markup format for TypeScript code, ideal for creating self-contained code samples which let the TypeScript compiler do the extra leg-work. Inspired by the [fourslash test system](https://github.com/orta/typescript-notes/blob/master/systems/testing/fourslash.md). This repo is the successor of [`@typescript/twoslash`](https://github.com/microsoft/TypeScript-Website/tree/v2/packages/ts-twoslasher).

- [Unified information interface](#information-nodes), consistent and easier to manipulate.
- [`createTwoslasher`](#createtwoslasher) to create a twoslash instance with cached language servers (🚀 **5-20 times faster**!)
- ESM-first, dual CJS/ESM builds.
- Lighter, no longer deps on `lz-string` and `debug`.
- [Additional options](#additional-handbook-options) for better custom language support (e.g. [`twoslash-vue`](https://github.com/antfu/twoslash-vue))

## Features

### `createTwoSlasher`

TwoSlash runs a TypeScript language server to get the information, which could be a heavy operation to load and parse all the files it needs. In repetitive usages, you may not want to initialize the language server every simple time. TwoSlash provides a `createTwoSlasher` factory function allows you to cache the language servers and reuse the already initialized files.

```ts
import { createTwoSlasher } from 'twoslash'

const twoslasher = createTwoSlasher({
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
import { createTwoSlasher } from 'twoslash'

const twoslasher = createTwoSlasher()

// do something

// Clear the cached language servers, free the memory
twoslasher.getCacheMap()?.clear()
```

### Information Nodes

TwoSlash<sup>es</sup> returns all types of information in the `nodes` array.

With some common properties:

- `type`: the type of the node. Can be `hover`, `query`, `error`, `tag`, `highlight` or `completion`
  - was `kind` in `@typescript/twoslash` for some entries
- `start`: the 0-indexed start position of the node in the output code
- `line`: a 0-indexed line number of the node in the output code
- `character`: a 0-indexed character number of the node in the output code
  - was `offset` in `@typescript/twoslash` for some entries
- `length`: length of the node

For different types of nodes, they have some extra properties:

#### `hover`

- `text`: the text of the hover, usually the type information of the given node
- `docs`: the jsdoc of the given node, can be `undefined`

#### `query`

Same as `hover`

#### `highlight`

- `text`: the extra annotation text of the highlight, can be `undefined`

#### `completion`

- `completion`: the completion entries
- `completionPrefix`: the prefix of the completion

#### `error`

- `text`: the error message
  - was `renderedMessage` in `@typescript/twoslash`
- `level`: the error level
  - was `category` in `@typescript/twoslash`
- `code`: TypeScript error code
- `id`: a generated based on the code and position of the error

#### `tag`

- `text`: the text of the tag
  - was `annotation` in `@typescript/twoslash`

#### Getters

To make it easier to access, we also provide some getters shortcuts to each type of the nodes:

```ts
export interface TwoSlashReturn {
  /** The output code */
  code: string

  /**
   * Nodes containing various bits of information about the code
   */
  nodes: TwoSlashNode[]

  /** Getters */
  get hovers(): NodeHover[] // was `staticQuickInfos`
  get queries(): NodeQuery[] // was `queries` with `kind: 'query'`
  get completions(): NodeCompletion[] // was `queries` with `kind: 'completion'`
  get errors(): NodeError[]
  get highlights(): NodeHighlight[]
  get tags(): NodeTag[]

  /**
   * The meta information
   */
  meta: TwoSlashReturnMeta
}
```

### Additional Handbook Options

In addition to the options provided by `@typescript/twoslash`, TwoSlash<sup>es</sup> provides some additional options:

#### `keepNotations`

Tell TwoSlash to not remove any notations, and keep the original code untouched. The `nodes` will have the position information of the original code. Useful for better source mapping combing with `meta.removals`.

Default: `false`

#### `noErrorsCutted`

Ignore errors that occurred in the cutted code.

Default: `false`

### Additional Meta Information

An additional `meta` property is returned providing additional information about the result.

#### `meta.flagNotations`

The list of options flag notation that is detected from the code.

#### `meta.removals`

A list of the index ranges of the code removed by TwoSlash from the original code, useful for better source mapping.

#### `meta.compilerOptions`

The final resolved `compilerOptions`

#### `meta.handbookOptions`

The final resolved `handbookOptions`

## Benchmark

<details>
<summary> Benchmark generated at 2024-01-11</summary>

```
  twoslash - bench/compare.bench.ts > compiler_errors.ts
    18.28x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > compiler_flags.ts
    20.41x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > completions.ts
    11.08x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > cuts_out_unnecessary_code.ts
    9.72x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > errorsWithGenerics.ts
    11.08x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > highlighting.ts
    10.90x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > import_files.ts
    6.62x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > importsModules.ts
    6.06x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > multiFileErrors.ts
    4.35x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > query.ts
    13.15x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > arbitraryCommands.ts
    10.98x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > crossExports.ts
    6.16x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > cut_file_errors.ts
    10.34x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > cut_files.ts
    13.73x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > handlesJSON.ts
    4.16x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > inlineHighlights.ts
    13.28x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > large-cut.ts
    10.23x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > lib.ts
    12.57x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > multiLookups.ts
    11.82x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > queriesWithSpaceBefore.ts
    12.51x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > queryHandlesNoToken.ts
    10.36x faster than @typescript/twoslash

  twoslash - bench/compare.bench.ts > twoliner.ts
    6.58x faster than @typescript/twoslash
```

</details>

## License

MIT License © Microsoft Corporation

MIT License © 2023-PRESENT [Anthony Fu](https://github.com/antfu)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/twoslash?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/twoslash
[npm-downloads-src]: https://img.shields.io/npm/dm/twoslash?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/twoslash
[bundle-src]: https://img.shields.io/bundlephobia/minzip/twoslash?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=twoslash
[license-src]: https://img.shields.io/github/license/antfu/twoslash.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/antfu/twoslash/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/twoslash
