import type { VirtualTypeScriptEnvironment } from '@typescript/vfs'
import type { CompilerOptions, CompletionEntry, CustomTransformers } from 'typescript'
import type { VirtualFile } from './utils'

type TS = typeof import('typescript')

export type TwoSlashFunction = (code: string, extension?: string, options?: TwoSlashExecuteOptions) => TwoSlashReturn

/**
 * Options for the `twoslasher` function
 */
export interface TwoSlashOptions extends CreateTwoSlashOptions, TwoSlashExecuteOptions { }

/**
 * Options for twoslash instance
 */
export interface TwoSlashExecuteOptions extends Partial<Pick<TwoSlashReturnMeta, 'positionQueries' | 'positionCompletions' | 'positionHighlights'>> {
  /** Allows setting any of the handbook options from outside the function, useful if you don't want LSP identifiers */
  handbookOptions?: Partial<HandbookOptions>

  /** Allows setting any of the compiler options from outside the function */
  compilerOptions?: CompilerOptions

  /** A set of known `// @[tags]` tags to extract and not treat as a comment */
  customTags?: string[]

  /**
   * A custom hook to filter out hover info for certain identifiers
   */
  shouldGetHoverInfo?: (identifier: string, start: number, filename: string) => boolean
  /**
   * A custom predicate to filter out nodes for further processing
   */
  filterNode?: (node: NodeWithoutPosition) => boolean
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
   * Get the internal cache map
   */
  getCacheMap(): Map<string, VirtualTypeScriptEnvironment> | undefined
}

export interface TwoSlashReturn {
  /** The output code, could be TypeScript, but could also be a JS/JSON/d.ts */
  code: string

  /**
   * Nodes containing various bits of information about the code
   */
  nodes: TwoSlashNode[]

  /**
   * The meta information the twoslash run
   */
  meta: TwoSlashReturnMeta

  get queries(): NodeQuery[]
  get completions(): NodeCompletion[]
  get errors(): NodeError[]
  get highlights(): NodeHighlight[]
  get hovers(): NodeHover[]
  get tags(): NodeTag[]
}

export interface TwoSlashReturnMeta {
  /**
   * The new extension type for the code, potentially changed if they've requested emitted results
   */
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
  /**
   * Flags which were parsed from the code
   */
  flagNotations: ParsedFlagNotation[]
  /**
   * The virtual files which were created
   */
  virtualFiles: VirtualFile[]
  /**
   * Positions of queries in the code
   */
  positionQueries: number[]
  /**
   * Positions of completions in the code
   */
  positionCompletions: number[]
  /**
   * Positions of errors in the code
   */
  positionHighlights: Range[]
}

export interface CompilerOptionDeclaration {
  name: string
  type: 'list' | 'boolean' | 'number' | 'string' | Map<string, any>
  element?: CompilerOptionDeclaration
}

/** Available inline flags which are not compiler flags */
export interface HandbookOptions {
  /** An array of TS error codes, which you write as space separated - this is so the tool can know about unexpected errors */
  errors: number[]
  /** Lets the sample suppress all error diagnostics */
  noErrors: boolean
  /** Declare that you don't need to validate that errors have corresponding annotations, defaults to false */
  noErrorValidation: boolean
  /** Whether to disable the pre-cache of LSP calls for interesting identifiers, defaults to false */
  noStaticSemanticInfo: boolean

  /** Shows the JS equivalent of the TypeScript code instead */
  showEmit: boolean
  /**
   * Must be used with showEmit, lets you choose the file to present instead of the source - defaults to index.js which
   * means when you just use `showEmit` above it shows the transpiled JS.
   */
  showEmittedFile?: string

  /**
   * Declare that the TypeScript program should edit the fsMap which is passed in, this is only useful for tool-makers, defaults to false
   *
   * @deprecated not suppported yet
   */
  emit: boolean

  // ==== New in twoslash ====
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

/**
 * Basic node with start and length to represent a range in the code
 */
export interface NodeStartLength {
  /** 0-indexed position of the node in the file */
  start: number
  /** The length of the node */
  length: number
}

export interface NodeBase extends NodeStartLength, Position {}

export interface NodeHover extends NodeBase {
  type: 'hover'
  /** The string content of the node this represents (mainly for debugging) */
  target: string
  /** The base LSP response (the type) */
  text: string
  /** Attached JSDoc info */
  docs?: string
}

export interface NodeHighlight extends Omit<NodeHover, 'type'> {
  type: 'highlight'
}

export interface NodeQuery extends Omit<NodeHover, 'type'> {
  type: 'query'
}

export interface NodeCompletion extends NodeBase {
  type: 'completion'
  /** Results for completions at a particular point */
  completions: CompletionEntry[]
  /* Completion prefix e.g. the letters before the cursor in the word so you can filter */
  completionsPrefix: string
}

export interface NodeError extends NodeBase {
  type: 'error'
  id: string
  level: 0 | 1 | 2 | 3
  code: number
  text: string
  filename: string
}

export interface NodeTag extends NodeBase {
  type: 'tag'
  /** What was the name of the tag */
  name: string
  /** What was the text after the `// @tag: ` string  (optional because you could do // @tag on it's own line without the ':') */
  text?: string
}

export interface ParsedFlagNotation {
  type: 'compilerOptions' | 'handbookOptions' | 'tag' | 'unknown'
  name: string
  value: any
  start: number
  end: number
}

export type TwoSlashNode = NodeHighlight | NodeHover | NodeQuery | NodeCompletion | NodeError | NodeTag
export type NodeWithoutPosition =
  | Omit<NodeHighlight, keyof Position>
  | Omit<NodeHover, keyof Position>
  | Omit<NodeQuery, keyof Position>
  | Omit<NodeCompletion, keyof Position>
  | Omit<NodeError, keyof Position>
  | Omit<NodeTag, keyof Position>

export type NodeErrorWithoutPosition = Omit<NodeError, keyof Position>
