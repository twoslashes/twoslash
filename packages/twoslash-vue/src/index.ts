import { SourceMap, createVueLanguage, sharedTypes } from '@vue/language-core'
import ts from 'typescript'
import type {
  CreateTwoslashOptions,
  Range,
  TwoslashExecuteOptions,
  TwoslashInstance,
  TwoslashReturnMeta,
} from 'twoslash'
import {
  createPositionConverter,
  createTwoslasher as createTwoslasherBase,
  defaultCompilerOptions,
  findQueryMarkers,
  removeCodeRanges,
  resolveNodePositions,
} from 'twoslash'

/**
 * Create a twoslasher instance that add additional support for Vue SFC.
 */
export function createTwoslasher(createOptions: CreateTwoslashOptions = {}, flag = true): TwoslashInstance {
  const twoslasherBase = createTwoslasherBase(createOptions)

  function twoslasher(code: string, extension?: string, options: TwoslashExecuteOptions = {}) {
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

    const sourceMeta = {
      removals: [] as Range[],
      positionCompletions: [] as number[],
      positionQueries: [] as number[],
      positionHighlights: [] as Range[],
    } satisfies Partial<TwoslashReturnMeta>

    const pc = createPositionConverter(code)
    // we get the markers with the original code so the position is correct
    findQueryMarkers(code, sourceMeta, pc.getIndexOfLineAbove)

    // replace non-whitespace in the already extracted markers
    let strippedCode = code
    for (const [start, end] of sourceMeta.removals) {
      strippedCode
       = strippedCode.slice(0, start)
       + strippedCode.slice(start, end).replace(/\S/g, ' ')
       + strippedCode.slice(end)
    }

    const fileSource = lang.createVirtualFile('index.vue', ts.ScriptSnapshot.fromString(strippedCode), 'vue')!
    const fileCompiled = fileSource.getEmbeddedFiles()[0]
    const typeHelpers = sharedTypes.getTypesCode(fileSource.vueCompilerOptions)
    const compiled = [
      (fileCompiled as any).content.map((c: any) => Array.isArray(c) ? c[0] : c).join(''),
      '// ---cut-after---',
      typeHelpers,
    ].join('\n')

    const map = new SourceMap(fileCompiled.mappings)

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
      positionCompletions: sourceMeta.positionCompletions
        .map(p => map.toGeneratedOffset(p)![0]),
      positionQueries: sourceMeta.positionQueries
        .map(p => map.toGeneratedOffset(p)![0]),
      positionHighlights: sourceMeta.positionHighlights
        .map(([start, end]) => [map.toGeneratedOffset(start)![0], map.toGeneratedOffset(end)![0]] as Range),
    })

    if (!flag)
      return result

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

    const mappedRemovals = [
      ...sourceMeta.removals,
      ...result.meta.removals
        .map((r) => {
          const start = map.toSourceOffset(r[0])?.[0]
          const end = map.toSourceOffset(r[1])?.[0]
          if (start == null || end == null || start < 0 || end < 0 || start >= end)
            return undefined
          return [start, end] as Range
        })
        .filter(isNotNull),
    ]

    if (!options.handbookOptions?.keepNotations) {
      const removed = removeCodeRanges(code, mappedRemovals, mappedNodes)
      result.code = removed.code
      result.meta.removals = removed.removals
      result.nodes = resolveNodePositions(removed.nodes, result.code)
    }
    else {
      result.meta.removals = mappedRemovals
    }

    return result
  }

  twoslasher.getCacheMap = twoslasherBase.getCacheMap

  return twoslasher
}

/**
 * @deprecated Use `createTwoslasher` instead.
 */
export const createTwoslasherVue = createTwoslasher

function isNotNull<T>(x: T | null | undefined): x is T {
  return x != null
}
