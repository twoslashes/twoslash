import type { VirtualTypeScriptEnvironment } from '@typescript/vfs'
import type { CompilerOptions, CompletionEntry, CustomTransformers } from 'typescript'

type TS = typeof import('typescript')

/**
 * Options for the `twoslasher` function
 */
export interface TwoSlashOptions extends CreateTwoSlashOptions, TwoSlashExecuteOptions { }

/**
 * Options for twoslash instance
 */
export interface TwoSlashExecuteOptions {
  /** Allows setting any of the handbook options from outside the function, useful if you don't want LSP identifiers */
  handbookOptions?: Partial<HandbookOptions>

  /** Allows setting any of the compiler options from outside the function */
  compilerOptions?: CompilerOptions

  /** A set of known `// @[tags]` tags to extract and not treat as a comment */
  customTags?: string[]
}

export interface CreateTwoSlashOptions extends TwoSlashExecuteOptions {
  /** Allows applying custom transformers to the emit result, only useful with the showEmit output */
  customTransformers?: CustomTransformers

  /** An optional copy of the TypeScript import, if missing it will be require'd. */
  tsModule?: TS

  /** Absolute path to the directory to look up built-in TypeScript .d.ts files. */
  tsLibDirectory?: string

  /**
   * An optional Map object which is passed into @typescript/vfs - if you are using twoslash on the
   * web then you'll need this to set up your lib *.d.ts files. If missing, it will use your fs.
   */
  fsMap?: Map<string, string>

  /** The cwd for the folder which the virtual fs should be overlaid on top of when using local fs, opts to process.cwd() if not present */
  vfsRoot?: string

  /**
   * Cache the ts envs based on compiler options, defaults to true
   */
  cache?: boolean | Map<string, VirtualTypeScriptEnvironment>
}

export interface TwoSlashInstance {
  /**
   * Run TwoSlash on a string of code, with a particular extension
   */
  (code: string, extension?: string, options?: TwoSlashExecuteOptions): TwoSlashReturn
  /**
   * Clear caches and dispose of the instance
   */
  dispose(): void
  /**
   * Get the internal cache map
   */
  getCacheMap(): Map<string, VirtualTypeScriptEnvironment> | undefined
}

export interface TwoSlashReturn {
  /** The output code, could be TypeScript, but could also be a JS/JSON/d.ts */
  code: string

  /**
   * Tokens contains various bits of information about the code
   */
  tokens: Token[]

  get queries(): TokenQuery[]
  get completions(): TokenCompletion[]
  get errors(): TokenError[]
  get highlights(): TokenHighlight[]
  get hovers(): TokenHover[]
  get tags(): TokenTag[]

  meta: {
    /** The new extension type for the code, potentially changed if they've requested emitted results */
    extension: string
    /**
     * Ranges of text which should be removed from the output
     */
    removals: Range[]
    /**
     * Resolved compiler options
     */
    compilerOptions: CompilerOptions
    /**
     * Resolved handbook options
     */
    handbookOptions: HandbookOptions
  }
}

/** Available inline flags which are not compiler flags */
export interface HandbookOptions {
  /** An array of TS error codes, which you write as space separated - this is so the tool can know about unexpected errors */
  errors: number[]
  /** Lets the sample suppress all error diagnostics */
  noErrors: boolean
  /** Declare that you don't need to validate that errors have corresponding annotations, defaults to false */
  noErrorValidation: boolean
  /**
   * Keep TwoSlash notations in the code, the tokens will have the position of the input code.
   * @default false
   */
  keepNotations?: boolean
  /** Whether to disable the pre-cache of LSP calls for interesting identifiers, defaults to false */
  noStaticSemanticInfo: boolean

  /** Shows the JS equivalent of the TypeScript code instead */
  showEmit: boolean
  /**
   * Must be used with showEmit, lets you choose the file to present instead of the source - defaults to index.js which
   * means when you just use `showEmit` above it shows the transpiled JS.
   */
  showEmittedFile?: string
  /** Declare that the TypeScript program should edit the fsMap which is passed in, this is only useful for tool-makers, defaults to false */
  emit: boolean
}

export interface Position {
  /**
   * 0-indexed line number
   */
  line: number
  /**
   * 0-indexed column number
   */
  character: number
}

export type Range = [start: number, end: number]

export interface TokenBase extends Position {
  /** The length of the token */
  length: number
  /** 0-indexed position of the token in the file */
  start: number
}

export interface TokenHover extends TokenBase {
  type: 'hover'
  /** The string content of the node this represents (mainly for debugging) */
  target: string
  /** The base LSP response (the type) */
  text: string
  /** Attached JSDoc info */
  docs?: string
}

export interface TokenHighlight extends Omit<TokenHover, 'type'> {
  type: 'highlight'
}

export interface TokenQuery extends Omit<TokenHover, 'type'> {
  type: 'query'
}

export interface TokenCompletion extends TokenBase {
  type: 'completion'
  /** Results for completions at a particular point */
  completions?: CompletionEntry[]
  /* Completion prefix e.g. the letters before the cursor in the word so you can filter */
  completionsPrefix?: string
}

export interface TokenError extends TokenBase {
  type: 'error'
  id: string
  level: 0 | 1 | 2 | 3
  code: number
  text: string
  filename: string
}

export interface TokenTag extends TokenBase {
  type: 'tag'
  /** What was the name of the tag */
  name: string
  /** What was the text after the `// @tag: ` string  (optional because you could do // @tag on it's own line without the ':') */
  text?: string
}

export type Token = TokenHighlight | TokenHover | TokenQuery | TokenCompletion | TokenError | TokenTag
export type TokenWithoutPosition =
  | Omit<TokenHighlight, keyof Position>
  | Omit<TokenHover, keyof Position>
  | Omit<TokenQuery, keyof Position>
  | Omit<TokenCompletion, keyof Position>
  | Omit<TokenError, keyof Position>
  | Omit<TokenTag, keyof Position>
