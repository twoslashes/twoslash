---
outline: deep
---

# Result References

// TODO: add more fields

## Information Nodes

TwoSlash returns all types of information in the `nodes` array.

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

## Meta Information

An additional `meta` property is returned providing additional information about the result.

### `meta.flagNotations`

The list of options flag notation that is detected from the code.

### `meta.removals`

A list of the index ranges of the code removed by TwoSlash from the original code, useful for better source mapping.

### `meta.compilerOptions`

The final resolved `compilerOptions`

### `meta.handbookOptions`

The final resolved `handbookOptions`
