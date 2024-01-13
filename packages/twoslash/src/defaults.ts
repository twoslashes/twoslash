import type { CompilerOptions, ModuleKind, ScriptTarget } from 'typescript'
import type { HandbookOptions } from './types'

export const defaultCompilerOptions: CompilerOptions = {
  strict: true,
  module: 99 satisfies ModuleKind.ESNext,
  target: 99 satisfies ScriptTarget.ESNext,
  allowJs: true,
  skipDefaultLibCheck: true,
  skipLibCheck: true,
}

export const defaultHandbookOptions: HandbookOptions = {
  errors: [],
  noErrors: false,
  showEmit: false,
  showEmittedFile: undefined,
  noStaticSemanticInfo: false,
  emit: false,
  noErrorValidation: false,
  keepNotations: false,
  noErrorsCutted: false,
}
