import type { TwoslashNode } from './nodes'

export interface TwoslashGenericResult {
  /**
   * The output code, could be TypeScript, but could also be a JS/JSON/d.ts
   */
  code: string

  /**
   * Extension of the output code
   */
  extension?: string

  /**
   * Nodes containing various bits of information about the code
   */
  nodes: TwoslashNode[]
}

export type TwoslashGenericFunction<Options> = (code: string, filename?: string, options?: Options) => TwoslashGenericResult
