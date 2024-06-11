import type { Language, VueCompilerOptions } from '@vue/language-core'
import { FileMap, SourceMap, createLanguage, createVueLanguagePlugin, resolveVueCompilerOptions } from '@vue/language-core'
import type { CompilerOptions } from 'typescript'
import ts from 'typescript'
import type {
  CompilerOptionDeclaration,
  CreateTwoslashOptions,
  HandbookOptions,
  ParsedFlagNotation,
  Range,
  TwoslashExecuteOptions,
  TwoslashInstance,
  TwoslashReturnMeta,
} from 'twoslash'
import {
  createTwoslasher as createTwoslasherBase,
  defaultCompilerOptions,
  defaultHandbookOptions,
  findFlagNotations,
  findQueryMarkers,
  getObjectHash,
} from 'twoslash'
import {
  createPositionConverter,
  removeCodeRanges,
  resolveNodePositions,
} from 'twoslash-protocol'

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
  const cache = twoslasherBase.getCacheMap() as any as Map<string, Language> | undefined
  const tsOptionDeclarations = (ts as any).optionDeclarations as CompilerOptionDeclaration[]

  function getVueLanguage(compilerOptions: Partial<CompilerOptions>, vueCompilerOptions: Partial<VueCompilerOptions>) {
    if (!cache)
      return getLanguage()
    const key = `vue:${getObjectHash([compilerOptions, vueCompilerOptions])}`
    if (!cache.has(key)) {
      const env = getLanguage()
      cache.set(key, env)
      return env
    }
    return cache.get(key)!

    function getLanguage() {
      const vueLanguagePlugin = createVueLanguagePlugin<string>(ts, id => id, () => '', () => true, defaultCompilerOptions, resolveVueCompilerOptions(vueCompilerOptions))
      return createLanguage(
        [vueLanguagePlugin],
        new FileMap(ts.sys.useCaseSensitiveFileNames),
        () => {},
      )
    }
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
      positionHighlights: [] as TwoslashReturnMeta['positionHighlights'],
      flagNotations: [] as ParsedFlagNotation[],
    } satisfies Partial<TwoslashReturnMeta>

    const {
      customTags = createOptions.customTags || [],
    } = options

    const pc = createPositionConverter(code)
    // we get the markers with the original code so the position is correct
    findQueryMarkers(code, sourceMeta, pc)
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
    const sourceScript = lang.scripts.set('index.vue', ts.ScriptSnapshot.fromString(strippedCode))!
    const fileCompiled = [...sourceScript.generated!.embeddedCodes.values()][1]
    const compiled = [
      fileCompiled.snapshot.getText(0, fileCompiled.snapshot.getLength()),
    ].join('\n')
      .replace(/(?=export const __VLS_globalTypesStart)/, '// ---cut-after---\n')

    const map = new SourceMap(fileCompiled.mappings)

    function getLastGeneratedOffset(pos: number) {
      const offsets = [...map.getGeneratedOffsets(pos)]
      if (!offsets.length)
        return undefined
      return offsets[offsets.length - 1]?.[0]
    }

    // Pass compiled to TS file to twoslash
    const result = twoslasherBase(compiled, 'tsx', {
      ...options,
      compilerOptions: {
        jsx: 1 satisfies ts.JsxEmit.Preserve,
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
        .map(p => [...map.getGeneratedOffsets(p)][0]?.[0]),
      positionHighlights: sourceMeta.positionHighlights
        .map(([start, end]) => [[...map.getGeneratedOffsets(start)][0]?.[0], [...map.getGeneratedOffsets(end)][0]?.[0]]),
    })

    if (createOptions.debugShowGeneratedCode)
      return result

    // Map the tokens
    const mappedNodes = result.nodes
      .map((q) => {
        if ('text' in q && q.text === 'any')
          return undefined
        const startMap = [...map.getSourceOffsets(q.start)][0]
        if (!startMap)
          return undefined
        const start = startMap[0]
        let end = [...map.getSourceOffsets(q.start + q.length)][0]?.[0]
        if (end == null && startMap[1].sourceOffsets[0] === startMap[0])
          end = startMap[1].sourceOffsets[1]
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
          const start = [...map.getSourceOffsets(r[0])][0]?.[0]
          const end = [...map.getSourceOffsets(r[1])][0]?.[0]
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
