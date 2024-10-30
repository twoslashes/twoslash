import type { CodeMapping } from '@volar/language-core'
import type { CompilerOptionDeclaration, CreateTwoslashOptions, HandbookOptions, ParsedFlagNotation, Range, TwoslashExecuteOptions, TwoslashInstance, TwoslashReturnMeta } from 'twoslash'
import type { CompilerOptions } from 'typescript'
import { decode } from '@jridgewell/sourcemap-codec'
import { SourceMap } from '@volar/language-core'
import { svelte2tsx } from 'svelte2tsx'
import { createTwoslasher as createTwoslasherBase, defaultCompilerOptions, defaultHandbookOptions, findFlagNotations, findQueryMarkers } from 'twoslash'
import { createPositionConverter, removeCodeRanges, resolveNodePositions } from 'twoslash-protocol'
import ts from 'typescript'
import pkg from 'vscode-html-languageservice'

const { TextDocument } = pkg

export interface CreateTwoslashSvelteOptions extends CreateTwoslashOptions {
  /**
   * Render the generated code in the output instead of the Vue file
   *
   * @default false
   */
  debugShowGeneratedCode?: boolean
}

/**
 * Create a twoslasher instance that add additional support for Vue SFC.
 */
export function createTwoslasher(createOptions: CreateTwoslashSvelteOptions = {}): TwoslashInstance {
  const twoslasherBase = createTwoslasherBase(createOptions)
  const tsOptionDeclarations = (ts as any).optionDeclarations as CompilerOptionDeclaration[]

  function twoslasher(code: string, extension?: string, options: TwoslashExecuteOptions = {}) {
    if (extension !== 'svelte')
      return twoslasherBase(code, extension, options)

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

    let strippedCode = code
    for (const [start, end] of sourceMeta.removals) {
      strippedCode
       = strippedCode.slice(0, start)
       + strippedCode.slice(start, end).replace(/\S/g, ' ')
       + strippedCode.slice(end)
    }

    const compiled = svelte2tsx(strippedCode)
    const map = generateSourceMap(strippedCode, compiled.code, compiled.map.mappings)

    function getLastGeneratedOffset(pos: number) {
      const offsets = [...map.toGeneratedLocation(pos)]
      if (!offsets.length)
        return undefined
      return offsets[offsets.length - 1]?.[0]
    }

    const result = twoslasherBase(compiled.code, 'tsx', {
      ...options,
      compilerOptions: {
        types: [
          '../node_modules/svelte2tsx/svelte-jsx',
          '../node_modules/svelte2tsx/svelte-jsx-v4',
          '../node_modules/svelte2tsx/svelte-shims',
          '../node_modules/svelte2tsx/svelte-shims-v4',
        ],
        ...compilerOptions,
      },
      handbookOptions: {
        ...handbookOptions,
        keepNotations: true,
      },
      positionCompletions: sourceMeta.positionCompletions
        .map(p => getLastGeneratedOffset(p)!),
      positionQueries: sourceMeta.positionQueries
        .map(p => get(map.toGeneratedLocation(p), 0)?.[0])
        .filter(isNotNull),
      positionHighlights: sourceMeta.positionHighlights
        .map(([start, end]) => [
          get(map.toGeneratedLocation(start), 0)?.[0],
          get(map.toGeneratedLocation(end), 0)?.[0],
        ])
        .filter((x): x is [number, number] => x[0] != null && x[1] != null),
    })

    if (createOptions.debugShowGeneratedCode)
      return result

    // Map the tokens
    const mappedNodes = result.nodes
      .map((q) => {
        if ('text' in q && q.text === 'any')
          return undefined
        const startMap = get(map.toSourceLocation(q.start), 0)
        if (!startMap)
          return undefined
        const start = startMap[0]
        let end = get(map.toSourceLocation(q.start + q.length), 0)?.[0]
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
      ...result.meta.removals.map((r) => {
        const start = get(map.toSourceLocation(r[0]), 0)?.[0] ?? code.match(/(?<=<script[\s\S]*>\s)/)?.index
        const end = get(map.toSourceLocation(r[1]), 0)?.[0]
        if (start == null || end == null || start < 0 || end < 0 || start >= end)
          return undefined
        return [start, end] as Range
      }).filter(isNotNull),
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
    result.meta.extension = 'svelte'
    return result
  }

  twoslasher.getCacheMap = twoslasherBase.getCacheMap

  return twoslasher
}

function isNotNull<T>(x: T | null | undefined): x is T {
  return x != null
}

function get<T>(iterator: IterableIterator<T> | Generator<T>, index: number): T | undefined {
  for (const item of iterator) {
    if (index-- === 0)
      return item
  }
  return undefined
}

/**
 * Generate a `@volar/source-map` from a sourcemap object.
 * @param sourceCode - Source code
 * @param generatedCode - Generated code
 * @param encodedMappings - Base64 VLQ encoded mappings
 * @returns {SourceMap} - a `@volar/source-map`
 *
 * Copied from `@astro/language-services`
 * @see https://github.com/withastro/language-tools/blob/df90fe5f79978b567387cc1b0cedcc23a43bd156/packages/language-server/src/core/astro2tsx.ts#L97-L161
 */
function generateSourceMap(
  sourceCode: string,
  generatedCode: string,
  encodedMappings: string,
): SourceMap {
  const v3Mappings = decode(encodedMappings)
  const sourcedDoc = TextDocument.create('', 'svelte', 0, sourceCode)
  const genDoc = TextDocument.create('', 'typescriptreact', 0, generatedCode)
  const mappings: CodeMapping[] = []

  let current:
    | {
      genOffset: number
      sourceOffset: number
    }
    | undefined

  for (let genLine = 0; genLine < v3Mappings.length; genLine++) {
    for (const segment of v3Mappings[genLine]) {
      const genCharacter = segment[0]
      const genOffset = genDoc.offsetAt({ line: genLine, character: genCharacter })
      if (current) {
        let length = genOffset - current.genOffset
        const sourceText = sourceCode.substring(current.sourceOffset, current.sourceOffset + length)
        const genText = generatedCode.substring(current.genOffset, current.genOffset + length)
        if (sourceText !== genText) {
          length = 0
          for (let i = 0; i < genOffset - current.genOffset; i++) {
            if (sourceText[i] === genText[i]) {
              length = i + 1
            }
            else {
              break
            }
          }
        }
        if (length > 0) {
          const lastMapping = mappings.length ? mappings[mappings.length - 1] : undefined
          if (
            lastMapping
            && lastMapping.generatedOffsets[0] + lastMapping.lengths[0] === current.genOffset
            && lastMapping.sourceOffsets[0] + lastMapping.lengths[0] === current.sourceOffset
          ) {
            lastMapping.lengths[0] += length
          }
          else {
            mappings.push({
              sourceOffsets: [current.sourceOffset],
              generatedOffsets: [current.genOffset],
              lengths: [length],
              data: {
                verification: true,
                completion: true,
                semantic: true,
                navigation: true,
                structure: true,
                format: false,
              },
            })
          }
        }
        current = undefined
      }
      if (segment[2] !== undefined && segment[3] !== undefined) {
        const sourceOffset = sourcedDoc.offsetAt({ line: segment[2], character: segment[3] })
        current = {
          genOffset,
          sourceOffset,
        }
      }
    }
  }
  return new SourceMap(mappings)
}
