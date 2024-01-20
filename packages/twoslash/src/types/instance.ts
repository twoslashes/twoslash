import type { VirtualTypeScriptEnvironment } from '@typescript/vfs'
import type { TwoslashReturn } from './returns'
import type { TwoslashExecuteOptions } from './options'

export type TwoslashFunction = (code: string, extension?: string, options?: TwoslashExecuteOptions) => TwoslashReturn

export interface TwoslashInstance {
  /**
   * Run Twoslash on a string of code, with a particular extension
   */
  (code: string, extension?: string, options?: TwoslashExecuteOptions): TwoslashReturn
  /**
   * Get the internal cache map
   */
  getCacheMap(): Map<string, VirtualTypeScriptEnvironment> | undefined
}
