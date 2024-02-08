import type { CompilerOptions } from 'typescript'
import type { NodeCompletion, NodeError, NodeHighlight, NodeHover, NodeQuery, NodeTag, Range, TwoslashGenericResult } from 'twoslash-protocol'
import type { HandbookOptions } from './handbook-options'

export interface TwoslashReturn extends TwoslashGenericResult {
  /**
   * The meta information the twoslash run
   */
  meta: TwoslashReturnMeta

  get queries(): NodeQuery[]
  get completions(): NodeCompletion[]
  get errors(): NodeError[]
  get highlights(): NodeHighlight[]
  get hovers(): NodeHover[]
  get tags(): NodeTag[]
}

export interface TwoslashReturnMeta {
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
  positionHighlights: [start: number, end: number, text?: string][]
}

export interface ParsedFlagNotation {
  type: 'compilerOptions' | 'handbookOptions' | 'tag' | 'unknown'
  name: string
  value: any
  start: number
  end: number
}

export interface VirtualFile {
  offset: number
  filename: string
  filepath: string
  content: string
  extension: string
  supportLsp?: boolean
  prepend?: string
  append?: string
}
