import type { CompilerOptions } from 'typescript'
import type { CompletionEntry, ErrorLevel } from 'twoslash-protocol'
import type { HandbookOptions, TwoslashExecuteOptions, TwoslashReturn } from './types'

export interface TwoslashOptionsLegacy extends TwoslashExecuteOptions {
  /**
   * @deprecated, use `handbookOptions` instead
   */
  defaultOptions?: Partial<HandbookOptions>
  /**
   * @deprecated, use `compilerOptions` instead
   */
  defaultCompilerOptions?: CompilerOptions
}

export interface TwoslashReturnLegacy {
  /** The output code, could be TypeScript, but could also be a JS/JSON/d.ts */
  code: string

  /** The new extension type for the code, potentially changed if they've requested emitted results */
  extension: string

  /** Requests to highlight a particular part of the code */
  highlights: {
    kind: 'highlight'
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
    kind: 'query' | 'completions'
    /** What line is the highlighted identifier on? */
    line: number
    /** At what index in the line does the caret represent  */
    offset: number
    /** The text of the node which is highlighted */
    text?: string
    /** Any attached JSDocs */
    docs?: string | undefined
    /** The node start which the query indicates  */
    start: number
    /** The length of the node */
    length: number
    /** Results for completions at a particular point */
    completions?: import('typescript').CompletionEntry[]
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

export function convertLegacyOptions<T extends TwoslashOptionsLegacy>(opts: T): Omit<T, 'defaultOptions' | 'defaultCompilerOptions'> {
  return {
    ...opts,
    handbookOptions: opts.handbookOptions || opts.defaultOptions,
    compilerOptions: opts.compilerOptions || opts.defaultCompilerOptions,
  }
}

/**
 * Covert the new return type to the old one
 */
export function convertLegacyReturn(result: TwoslashReturn): TwoslashReturnLegacy {
  return {
    code: result.code,
    extension: result.meta.extension,

    staticQuickInfos: result.hovers
      .map((i): TwoslashReturnLegacy['staticQuickInfos'][0] => ({
        text: i.text,
        docs: i.docs || '',
        start: i.start,
        length: i.length,
        line: i.line,
        character: i.character,
        targetString: i.target,
      })),

    tags: result.tags
      .map((t): TwoslashReturnLegacy['tags'][0] => ({
        name: t.name,
        line: t.line,
        annotation: t.text,
      })),

    highlights: result.highlights
      .map((h): TwoslashReturnLegacy['highlights'][0] => ({
        kind: 'highlight',
        // it's a bit confusing that `offset` and `start` are flipped
        offset: h.start,
        start: h.character,
        length: h.length,
        line: h.line,
        text: h.text || '',
      })),

    queries: ([
      ...result.queries
        .map((q): TwoslashReturnLegacy['queries'][0] => ({
          kind: 'query',
          docs: q.docs || '',
          offset: q.character,
          start: q.start,
          length: q.length,
          line: q.line + 1,
          text: q.text,
        })),
      ...result.completions
        .map((q): TwoslashReturnLegacy['queries'][0] => ({
          kind: 'completions',
          offset: q.character,
          start: q.start,
          length: q.length,
          line: q.line + 1,
          completions: q.completions as any,
          completionsPrefix: q.completionsPrefix,
        })),
    ] as TwoslashReturnLegacy['queries'])
      .sort((a, b) => a.start - b.start),

    errors: result.errors
      .map((e): TwoslashReturnLegacy['errors'][0] => ({
        id: e.id ?? '',
        code: e.code as number,
        start: e.start,
        length: e.length,
        line: e.line,
        character: e.character,
        renderedMessage: e.text,
        category: errorLevelToCategory(e.level),
      })),

    playgroundURL: '',
  }
}

function errorLevelToCategory(level?: ErrorLevel) {
  switch (level) {
    case 'warning': return 0
    case 'suggestion': return 2
    case 'message': return 3
    case 'error': return 1
  }
  return 1
}
