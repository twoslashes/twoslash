/**
 * Basic node with start and length to represent a range in the code
 */
export interface NodeStartLength {
  /** 0-indexed position of the node in the file */
  start: number
  /** The length of the node */
  length: number
}

export interface NodeBase extends NodeStartLength, Position {

}

export interface NodeHover extends NodeBase {
  type: 'hover'
  /** The string content of the node this represents (mainly for debugging) */
  target: string
  /** The base LSP response (the type) */
  text: string
  /** Attached JSDoc info */
  docs?: string
  /** JSDoc tags */
  tags?: [name: string, text: string | undefined][]
}

export interface NodeHighlight extends NodeBase {
  type: 'highlight'
  /** The annotation message */
  text?: string
}

export interface NodeQuery extends Omit<NodeHover, 'type'> {
  type: 'query'
}

export interface CompletionEntry {
  name: string
  kind?: string
}

export interface NodeCompletion extends NodeBase {
  type: 'completion'
  /** Results for completions at a particular point */
  completions: CompletionEntry[]
  /* Completion prefix e.g. the letters before the cursor in the word so you can filter */
  completionsPrefix: string
}

export type ErrorLevel = 'warning' | 'error' | 'suggestion' | 'message'

export interface NodeError extends NodeBase {
  type: 'error'
  id?: string
  /**
   * Error level
   * When not provided, defaults to 'error'
   */
  level?: ErrorLevel
  /**
   * Error code
   */
  code?: number | string
  /**
   * Error message
   */
  text: string
  /**
   * The filename of the file the error is in
   */
  filename?: string
}

export interface NodeTag extends NodeBase {
  type: 'tag'
  /** What was the name of the tag */
  name: string
  /** What was the text after the `// @tag: ` string  (optional because you could do // @tag on it's own line without the ':') */
  text?: string
}

export type TwoslashNode = NodeHighlight | NodeHover | NodeQuery | NodeCompletion | NodeError | NodeTag

export type NodeWithoutPosition = Omit<NodeHighlight, keyof Position>
  | Omit<NodeHover, keyof Position>
  | Omit<NodeQuery, keyof Position>
  | Omit<NodeCompletion, keyof Position>
  | Omit<NodeError, keyof Position>
  | Omit<NodeTag, keyof Position>

export type NodeErrorWithoutPosition = Omit<NodeError, keyof Position>

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
