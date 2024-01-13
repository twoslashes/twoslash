import type { CompilerOptions } from 'typescript'
import type { HandbookOptions } from './handbook-options'
import type { NodeCompletion, NodeError, NodeHighlight, NodeHover, NodeQuery, NodeTag, Range, TwoSlashNode } from './nodes'

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
}
