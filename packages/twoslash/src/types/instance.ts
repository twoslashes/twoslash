import type { VirtualTypeScriptEnvironment } from '@typescript/vfs'
import type { TwoSlashReturn } from './returns'
import type { TwoSlashExecuteOptions } from './options'

export type TwoSlashFunction = (code: string, extension?: string, options?: TwoSlashExecuteOptions) => TwoSlashReturn

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
