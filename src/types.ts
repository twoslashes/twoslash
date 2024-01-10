import type { CompilerOptions, CustomTransformers } from "typescript"
type TS = typeof import("typescript")

// Hacking in some internal stuff

declare module "typescript" {
  interface Option {
    name: string;
    type: "list" | "boolean" | "number" | "string" | Map<string, any>;
    element?: Option;
  }

  const optionDeclarations: Array<Option>;
}

export interface TokenBase {
  /** 0-indexed position of the token in the file */
  start: number
  /** The length of the token */
  length: number
}

export interface TokenHightlight extends TokenBase {
  type: 'highlight'
  /** The text of the token which is highlighted */
  text?: string
}

export interface TokenQuickInfo extends TokenBase {
  type: 'quick-info'
  /** The string content of the node this represents (mainly for debugging) */
  targetString: string
  /** The base LSP response (the type) */
  text: string
  /** Attached JSDoc info */
  docs: string | undefined
}

export interface TokenQuery extends TokenBase {
  type: 'query'
  /** The text of the token which is highlighted */
  text?: string
  /** Any attached JSDocs */
  docs?: string | undefined
}



export interface TwoSlashReturn {
  /** The output code, could be TypeScript, but could also be a JS/JSON/d.ts */
  code: string

  /** The new extension type for the code, potentially changed if they've requested emitted results */
  extension: string

  /** Requests to highlight a particular part of the code */
  highlights: {
    kind: "highlight"
    /** The index of the text in the file */
    start: number
    /** What line is the highlighted identifier on? */
    line: number
    /** At what index in the line does the caret represent  */
    offset: number
    /** The text of the token which is highlighted */
    text?: string
    /** The length of the token */
    length: number
  }[]

  /** An array of LSP responses identifiers in the sample  */
  staticQuickInfos: {
    /** The string content of the node this represents (mainly for debugging) */
    targetString: string
    /** The base LSP response (the type) */
    text: string
    /** Attached JSDoc info */
    docs: string | undefined
    /** The index of the text in the file */
    start: number
    /** how long the identifier */
    length: number
    /** line number where this is found */
    line: number
    /** The character on the line */
    character: number
  }[]

  /** Requests to use the LSP to get info for a particular symbol in the source */
  queries: {
    kind: "query" | "completions"
    /** What line is the highlighted identifier on? */
    line: number
    /** At what index in the line does the caret represent  */
    offset: number
    /** The text of the token which is highlighted */
    text?: string
    /** Any attached JSDocs */
    docs?: string | undefined
    /** The token start which the query indicates  */
    start: number
    /** The length of the token */
    length: number
    /** Results for completions at a particular point */
    completions?: import("typescript").CompletionEntry[]
    /* Completion prefix e.g. the letters before the cursor in the word so you can filter */
    completionsPrefix?: string
  }[]

  /** The extracted twoslash commands for any custom tags passed in via customTags */
  tags: {
    /** What was the name of the tag */
    name: string
    /** Where was it located in the original source file */
    line: number
    /** What was the text after the `// @tag: ` string  (optional because you could do // @tag on it's own line without the ':') */
    annotation?: string
  }[]

  /** Diagnostic error messages which came up when creating the program */
  errors: {
    renderedMessage: string
    id: string
    category: 0 | 1 | 2 | 3
    code: number
    start: number | undefined
    length: number | undefined
    line: number | undefined
    character: number | undefined
  }[]

  /** The URL for this sample in the playground */
  playgroundURL: string
}

export interface TwoSlashOptions {
  /** Allows setting any of the handbook options from outside the function, useful if you don't want LSP identifiers */
  defaultOptions?: Partial<ExampleOptions>

  /** Allows setting any of the compiler options from outside the function */
  defaultCompilerOptions?: CompilerOptions

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

  /** A set of known `// @[tags]` tags to extract and not treat as a comment */
  customTags?: string[]
}

export interface QueryPosition {
  kind: "query" | "completion";
  offset: number;
  text: string | undefined;
  docs: string | undefined;
  line: number;
}
export interface PartialQueryResults {
  kind: "query";
  text: string;
  docs: string | undefined;
  line: number;
  offset: number;
  file: string;
}
export interface PartialCompletionResults {
  kind: "completions";
  completions: import("typescript").CompletionEntry[];
  completionPrefix: string;

  line: number;
  offset: number;
  file: string;
}
export type HighlightPosition = TwoSlashReturn["highlights"][number];


/** Available inline flags which are not compiler flags */
export interface ExampleOptions {
  /** Lets the sample suppress all error diagnostics */
  noErrors: boolean
  /** An array of TS error codes, which you write as space separated - this is so the tool can know about unexpected errors */
  errors: number[]
  /** Shows the JS equivalent of the TypeScript code instead */
  showEmit: boolean
  /**
   * Must be used with showEmit, lets you choose the file to present instead of the source - defaults to index.js which
   * means when you just use `showEmit` above it shows the transpiled JS.
   */
  showEmittedFile: string

  /** Whether to disable the pre-cache of LSP calls for interesting identifiers, defaults to false */
  noStaticSemanticInfo: boolean
  /** Declare that the TypeScript program should edit the fsMap which is passed in, this is only useful for tool-makers, defaults to false */
  emit: boolean
  /** Declare that you don't need to validate that errors have corresponding annotations, defaults to false */
  noErrorValidation: boolean
}
