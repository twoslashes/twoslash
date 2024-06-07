import type { CompilerOptions, ModuleDetectionKind, ModuleKind, ScriptTarget } from 'typescript'
import type { HandbookOptions } from './types/index.js'

export const defaultCompilerOptions: CompilerOptions = {
  strict: true,
  module: 99 satisfies ModuleKind.ESNext,
  target: 99 satisfies ScriptTarget.ESNext,
  allowJs: true,
  skipDefaultLibCheck: true,
  skipLibCheck: true,
  moduleDetection: 3 satisfies ModuleDetectionKind.Force,
}

export const defaultHandbookOptions: HandbookOptions = {
  errors: [],
  noErrors: false,
  noErrorsCutted: false,
  noErrorValidation: false,
  noStaticSemanticInfo: false,
  showEmit: false,
  showEmittedFile: undefined,
  keepNotations: false,
}
