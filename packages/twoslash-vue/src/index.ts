import { SourceMap, createVueLanguage, sharedTypes } from '@vue/language-core'
import ts from 'typescript'
import type {
  CreateTwoSlashOptions,
  Range,
  TwoSlashExecuteOptions,
  TwoSlashInstance,
} from 'twoslash'
import {
  createTwoSlasher as createTwoSlasherBase,
  defaultCompilerOptions,
  removeCodeRanges,
  resolveNodePositions,
} from 'twoslash'

/**
 * Create a twoslasher instance that add additional support for Vue SFC.
 */
export function createTwoSlasher(createOptions: CreateTwoSlashOptions = {}, flag = true): TwoSlashInstance {
  const twoslasherBase = createTwoSlasherBase(createOptions)

  function twoslasher(code: string, extension?: string, options: TwoSlashExecuteOptions = {}) {
    if (extension !== 'vue')
      return twoslasherBase(code, extension, options)

    // TODO: use cache like twoslasherBase
    const lang = createVueLanguage(
      ts,
      {
        ...defaultCompilerOptions,
        ...options.compilerOptions,
      },
    )

    const fileSource = lang.createVirtualFile('index.vue', ts.ScriptSnapshot.fromString(code), 'vue')!
    const fileCompiled = fileSource.getEmbeddedFiles()[0]
    const typeHelpers = sharedTypes.getTypesCode(fileSource.vueCompilerOptions)
    const compiled = [
      (fileCompiled as any).content.map((c: any) => Array.isArray(c) ? c[0] : c).join(''),
      '// ---cut-after---',
      typeHelpers,
    ].join('\n')

    // Pass compiled to TS file to twoslash
    const result = twoslasherBase(compiled, 'tsx', {
      ...options,
      compilerOptions: {
        jsx: 4 satisfies ts.JsxEmit.ReactJSX,
        jsxImportSource: 'vue',
        noImplicitAny: false,
        ...options.compilerOptions,
      },
      handbookOptions: {
        noErrorsCutted: true,
        ...options.handbookOptions,
        keepNotations: true,
      },
      shouldGetHoverInfo(id) {
        // ignore internal types
        return !id.startsWith('__VLS')
      },
    })

    if (!flag)
      return result

    const map = new SourceMap(fileCompiled.mappings)

    // Map the tokens
    const mappedNodes = result.nodes
      .map((q) => {
        if ('text' in q && q.text === 'any')
          return undefined
        const start = map.toSourceOffset(q.start)?.[0]
        const end = map.toSourceOffset(q.start + q.length)?.[0]
        if (start == null || end == null || start < 0 || end < 0 || start >= end)
          return undefined
        return Object.assign(q, {
          ...q,
          start,
          length: end - start,
        })
      })
      .filter(isNotNull)

    const mappedRemovals = result.meta.removals
      .map((r) => {
        const start = map.toSourceOffset(r[0])?.[0]
        const end = map.toSourceOffset(r[1])?.[0]
        if (start == null || end == null || start < 0 || end < 0 || start >= end)
          return undefined
        return [start, end] as Range
      })
      .filter(isNotNull)

    const removed = removeCodeRanges(code, mappedRemovals, mappedNodes)
    result.code = removed.code
    result.nodes = resolveNodePositions(removed.nodes, result.code)

    return result
  }

  twoslasher.getCacheMap = twoslasherBase.getCacheMap

  return twoslasher
}

/**
 * @deprecated Use `createTwoSlasher` instead.
 */
export const createTwoSlasherVue = createTwoSlasher

function isNotNull<T>(x: T | null | undefined): x is T {
  return x != null
}
