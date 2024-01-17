import type { VueCompilerOptions } from '@vue/language-core'
import { SourceMap, createVueLanguage, sharedTypes } from '@vue/language-core'
import type { CompilerOptions } from 'typescript'
import ts from 'typescript'
import type {
  CreateTwoslashOptions,
  HandbookOptions,
  ParsedFlagNotation,
  Range,
  TwoslashExecuteOptions,
  TwoslashInstance,
  TwoslashReturnMeta,
} from 'twoslash'
import {
  createPositionConverter,
  createTwoslasher as createTwoslasherBase,
  defaultCompilerOptions,
  defaultHandbookOptions,
  findFlagNotations,
  findQueryMarkers,
  objectHash,
  removeCodeRanges,
  resolveNodePositions,
} from 'twoslash'
import type { CompilerOptionDeclaration } from '../../twoslash/src/types/internal'

export interface VueSpecificOptions {
  /**
   * Vue Compiler options
   */
  vueCompilerOptions?: Partial<VueCompilerOptions>
}

export interface CreateTwoslashVueOptions extends CreateTwoslashOptions, VueSpecificOptions {
  /**
   * Render the generated code in the output instead of the Vue file
   *
   * @default false
   */
  debugShowGeneratedCode?: boolean
}

export interface TwoslashVueExecuteOptions extends TwoslashExecuteOptions, VueSpecificOptions {
}

/**
 * Create a twoslasher instance that add additional support for Vue SFC.
 */
export function createTwoslasher(createOptions: CreateTwoslashVueOptions = {}): TwoslashInstance {
  const twoslasherBase = createTwoslasherBase(createOptions)
  const cache = twoslasherBase.getCacheMap() as any as Map<string, ReturnType<typeof createVueLanguage>> | undefined
  const tsOptionDeclarations = (ts as any).optionDeclarations as CompilerOptionDeclaration[]

  function getVueLanguage(compilerOptions: Partial<CompilerOptions>, vueCompilerOptions: Partial<VueCompilerOptions>) {
    if (!cache)
      return createVueLanguage(ts, defaultCompilerOptions, vueCompilerOptions)
    const key = `vue:${objectHash([compilerOptions, vueCompilerOptions])}`
    if (!cache.has(key)) {
      const env = createVueLanguage(ts, defaultCompilerOptions, vueCompilerOptions)
      cache.set(key, env)
      return env
    }
    return cache.get(key)!
  }

  function twoslasher(code: string, extension?: string, options: TwoslashVueExecuteOptions = {}) {
    if (extension !== 'vue')
      return twoslasherBase(code, extension, options)

    const vueCompilerOptions: Partial<VueCompilerOptions> = {
      ...createOptions.vueCompilerOptions,
      ...options.vueCompilerOptions,
    }
    const compilerOptions: Partial<CompilerOptions> = {
      ...defaultCompilerOptions,
      ...options.compilerOptions,
    }
    const handbookOptions: Partial<HandbookOptions> = {
      ...defaultHandbookOptions,
      noErrorsCutted: true,
      ...options.handbookOptions,
    }

    const sourceMeta = {
      removals: [] as Range[],
      positionCompletions: [] as number[],
      positionQueries: [] as number[],
      positionHighlights: [] as Range[],
      flagNotations: [] as ParsedFlagNotation[],
    } satisfies Partial<TwoslashReturnMeta>

    const {
      customTags = createOptions.customTags || [],
    } = options

    const pc = createPositionConverter(code)
    // we get the markers with the original code so the position is correct
    findQueryMarkers(code, sourceMeta, pc.getIndexOfLineAbove)
    const flagNotations = findFlagNotations(code, customTags, tsOptionDeclarations)

    // #region apply flags
    for (const flag of flagNotations) {
      switch (flag.type) {
        case 'unknown':
          continue

        case 'compilerOptions':
          compilerOptions[flag.name] = flag.value
          break
        case 'handbookOptions':
          // @ts-expect-error -- this is fine
          handbookOptions[flag.name] = flag.value
          break
      }
      sourceMeta.removals.push([flag.start, flag.end])
    }
    // #endregion

    // replace non-whitespace in the already extracted markers
    let strippedCode = code
    for (const [start, end] of sourceMeta.removals) {
      strippedCode
       = strippedCode.slice(0, start)
       + strippedCode.slice(start, end).replace(/\S/g, ' ')
       + strippedCode.slice(end)
    }

    const lang = getVueLanguage(compilerOptions, vueCompilerOptions)
    const fileSource = lang.createVirtualFile('index.vue', ts.ScriptSnapshot.fromString(strippedCode), 'vue')!
    const fileCompiled = fileSource.getEmbeddedFiles()[0]
    const typeHelpers = sharedTypes.getTypesCode(fileSource.vueCompilerOptions)
    const compiled = [
      (fileCompiled as any).content.map((c: any) => Array.isArray(c) ? c[0] : c).join(''),
      '// ---cut-after---',
      typeHelpers,
    ].join('\n')

    const map = new SourceMap(fileCompiled.mappings)

    function getLastGeneratedOffset(pos: number) {
      const offsets = [...map.toGeneratedOffsets(pos)]
      if (!offsets.length)
        return undefined
      return offsets[offsets.length - 1]?.[0]
    }

    // Pass compiled to TS file to twoslash
    const result = twoslasherBase(compiled, 'tsx', {
      ...options,
      compilerOptions: {
        jsx: 4 satisfies ts.JsxEmit.ReactJSX,
        jsxImportSource: 'vue',
        noImplicitAny: false,
        ...compilerOptions,
      },
      handbookOptions: {
        ...handbookOptions,
        keepNotations: true,
      },
      shouldGetHoverInfo(id) {
        // ignore internal types
        return !id.startsWith('__VLS')
      },
      positionCompletions: sourceMeta.positionCompletions
        .map(p => getLastGeneratedOffset(p)!),
      positionQueries: sourceMeta.positionQueries
        .map(p => map.toGeneratedOffset(p)![0]),
      positionHighlights: sourceMeta.positionHighlights
        .map(([start, end]) => [map.toGeneratedOffset(start)![0], map.toGeneratedOffset(end)![0]] as Range),
    })

    if (createOptions.debugShowGeneratedCode)
      return result

    // Map the tokens
    const mappedNodes = result.nodes
      .map((q) => {
        if ('text' in q && q.text === 'any')
          return undefined
        const startMap = map.toSourceOffset(q.start)
        if (!startMap)
          return undefined
        const start = startMap[0]
        let end = map.toSourceOffset(q.start + q.length)?.[0]
        if (end == null && startMap[1].sourceRange[0] === startMap[0])
          end = startMap[1].sourceRange[1]
        if (end == null || start < 0 || end < 0 || start > end)
          return undefined
        return Object.assign(q, {
          ...q,
          target: code.slice(start, end),
          start: startMap[0],
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

    result.nodes = result.nodes.filter((n, idx) => {
      const next = result.nodes[idx + 1]
      if (!next)
        return true
      // When multiple nodes are on the same position, we keep the last one by ignoring the previous ones
      if (next.type === n.type && next.start === n.start)
        return false
      return true
    })

    result.meta.extension = 'vue'

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
