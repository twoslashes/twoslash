import type { CompilerOptions, CompletionEntry } from "typescript";
import type { HandbookOptions } from "./types";


export interface Position {
  /**
   * 1-indexed line number
   */
  line: number;
  /**
   * 0-indexed column number
   */
  character: number;
}

export type Range = [start: number, end: number];

export interface TokenBase extends Position {
  /** The length of the token */
  length: number;
  /** 0-indexed position of the token in the file */
  start: number;
}

export interface TokenHover extends TokenBase {
  type: 'hover';
  /** The string content of the node this represents (mainly for debugging) */
  target: string;
  /** The base LSP response (the type) */
  text: string;
  /** Attached JSDoc info */
  docs?: string
}

export interface TokenHighlight extends Omit<TokenHover, 'type'> {
  type: 'highlight';
}

export interface TokenQuery extends Omit<TokenHover, 'type'> {
  type: 'query';
}

export interface TokenCompletion extends TokenBase {
  type: 'completion';
  /** Results for completions at a particular point */
  completions?: CompletionEntry[];
  /* Completion prefix e.g. the letters before the cursor in the word so you can filter */
  completionsPrefix?: string;
}

export interface TokenError extends TokenBase {
  type: 'error';
  id: string;
  level: 0 | 1 | 2 | 3;
  code: number;
  text: string
  filename: string
}

export interface TokenTag extends TokenBase {
  type: 'tag';
  /** What was the name of the tag */
  name: string;
  /** What was the text after the `// @tag: ` string  (optional because you could do // @tag on it's own line without the ':') */
  text?: string;
}

export type Token = TokenHighlight | TokenHover | TokenQuery | TokenCompletion | TokenError | TokenTag;
export type TokenWithoutPosition = 
  | Omit<TokenHighlight, keyof Position>
  | Omit<TokenHover, keyof Position>
  | Omit<TokenQuery, keyof Position>
  | Omit<TokenCompletion, keyof Position>
  | Omit<TokenError, keyof Position>
  | Omit<TokenTag, keyof Position>

export interface TwoSlashReturnNew {
  /** The output code, could be TypeScript, but could also be a JS/JSON/d.ts */
  code: string;

  /**
   * Tokens contains various bits of information about the code
   */
  tokens: Token[];

  get queries(): TokenQuery[];
  get completions(): TokenCompletion[];
  get errors(): TokenError[];
  get highlights(): TokenHighlight[];
  get hovers(): TokenHover[];
  get tags(): TokenTag[];

  meta: {
    /** The new extension type for the code, potentially changed if they've requested emitted results */
    extension: string;
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


export interface TemporaryFile {
  offset: number
  filename: string
  content: string
}
