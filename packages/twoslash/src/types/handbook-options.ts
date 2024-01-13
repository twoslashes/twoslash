/** Available inline flags which are not compiler flags */
export interface HandbookOptions {
  /**
   *  An array of TS error codes, which you write as space separated - this is so the tool can know about unexpected errors
   */
  errors: number[]
  /**
   * Lets the sample suppress all error diagnostics
   */
  noErrors: boolean
  /**
   * Declare that you don't need to validate that errors have corresponding annotations, defaults to false
   */
  noErrorValidation: boolean
  /**
   * Whether to disable the pre-cache of LSP calls for interesting identifiers, defaults to false
   */
  noStaticSemanticInfo: boolean

  /**
   * Shows the JS equivalent of the TypeScript code instead
   */
  showEmit: boolean
  /**
   * Must be used with showEmit, lets you choose the file to present instead of the source - defaults to index.js which
   * means when you just use `showEmit` above it shows the transpiled JS.
   */
  showEmittedFile?: string

  /**
   * Do not remove twoslash notations from output code, the nodes will have the position of the input code.
   * @default false
   */
  keepNotations: boolean
  /**
   * Do not check errors in the cutted code.
   * @default false
   */
  noErrorsCutted: boolean
}
