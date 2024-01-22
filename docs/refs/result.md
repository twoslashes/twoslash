---
outline: deep
---

# Result References

The return value of Twoslash contains the following information:

```ts twoslash
import type { NodeCompletion, NodeError, NodeHighlight, NodeHover, NodeQuery, NodeTag, TwoslashNode, TwoslashReturnMeta } from 'twoslash'
// ---cut---
export interface TwoslashReturn {
  /** The output code, could be TypeScript, but could also be a JS/JSON/d.ts. */
  code: string
  /** Nodes containing various bits of information about the code. */
  nodes: TwoslashNode[]
  /** The meta information the twoslash run. */
  meta: TwoslashReturnMeta
  /** Getters shorthand. */
  get queries(): NodeQuery[]
  get completions(): NodeCompletion[]
  get errors(): NodeError[]
  get highlights(): NodeHighlight[]
  get hovers(): NodeHover[]
  get tags(): NodeTag[]
}
```

Check the [type definition](https://github.com/antfu/twoslashes/blob/main/packages/twoslash/src/types/returns.ts) for all the fields.

## Information Nodes

Twoslash returns all types of information in the `nodes` array. Check the [type definition](https://github.com/antfu/twoslashes/blob/main/packages/twoslash/src/types/nodes.ts) for all the fields.

### Properties

Nodes provide the following common properties:

- `type`: the type of the node. Can be `hover`, `query`, `error`, `tag`, `highlight` or `completion`
  - was `kind` in `@typescript/twoslash` for some entries
- `start`: the 0-indexed start position of the node in the output code
- `line`: a 0-indexed line number of the node in the output code
- `character`: a 0-indexed character number of the node in the output code
  - was `offset` in `@typescript/twoslash` for some entries
- `length`: length of the node

For different types of nodes, they have some extra properties:

#### Type `hover`

- `text`: the text of the hover, usually the type information of the given node
- `docs`: the jsdoc of the given node, can be `undefined`

#### Type `query`

Same as `hover`

#### Type `highlight`

- `text`: the extra annotation text of the highlight, can be `undefined`

#### Type `completion`

- `completion`: the completion entries
- `completionPrefix`: the prefix of the completion

#### Type `error`

- `text`: the error message
  - was `renderedMessage` in `@typescript/twoslash`
- `level`: the error level
  - was `category` in `@typescript/twoslash`
- `code`: TypeScript error code
- `id`: a generated based on the code and position of the error

#### Type `tag`

- `text`: the text of the tag
  - was `annotation` in `@typescript/twoslash`

### Getters

To make it easier to access, we also provide some getters shortcuts to each type of the nodes:

```ts
import type { NodeCompletion, NodeError, NodeHighlight, NodeHover, NodeQuery, NodeTag, TwoslashNode, TwoslashReturnMeta } from 'twoslash'
// ---cut---
export interface TwoslashReturn {
  nodes: TwoslashNode[]

  get hovers(): NodeHover[] // was `staticQuickInfos`
  get queries(): NodeQuery[] // was `queries` with `kind: 'query'`
  get completions(): NodeCompletion[] // was `queries` with `kind: 'completion'`
  get errors(): NodeError[]
  get highlights(): NodeHighlight[]
  get tags(): NodeTag[]
  // ....
}
```

## Meta Information

An additional `meta` property is returned providing additional information about the result. Check the [type definition](https://github.com/antfu/twoslashes/blob/main/packages/twoslash/src/types/returns.ts) for all the fields.

### `meta.flagNotations`

The list of options flag notation that is detected from the code.

### `meta.removals`

A list of the index ranges of the code removed by Twoslash from the original code, useful for better source mapping.

### `meta.compilerOptions`

The final resolved [`compilerOptions`](/refs/options#compiler-options).

### `meta.handbookOptions`

The final resolved [`handbookOptions`](/refs/options#handbook-options).
