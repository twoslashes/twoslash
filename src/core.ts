import type { CompilerOptions, ModuleKind, ScriptTarget } from 'typescript'
import { createFSBackedSystem, createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs'
import { objectHash } from 'ohash'
import { TwoslashError } from './error'
import type { CompilerOptionDeclaration, CreateTwoSlashOptions, HandbookOptions, ParsedFlagNotation, Position, Range, TokenError, TokenWithoutPosition, TwoSlashExecuteOptions, TwoSlashInstance, TwoSlashOptions, TwoSlashReturn } from './types'
import { createPositionConverter, getIdentifierTextSpans, isInRanges, parseFlag, removeCodeRanges, resolveTokenPositions, splitFiles, typesToExtension } from './utils'
import { validateCodeForErrors } from './validation'

export * from './public'

type TS = typeof import('typescript')

// TODO: Make them configurable maybe
const reConfigBoolean = /^\/\/\s?@(\w+)$/mg
const reConfigValue = /^\/\/\s?@(\w+):\s?(.+)$/mg
const reAnnonateMarkers = /^\s*\/\/\s*\^(\?|\||\^+)( .*)?$/mg

const cutString = '// ---cut---\n'
const cutAfterString = '// ---cut-after---\n'
// TODO: cut range

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

/**
 * Create a TwoSlash instance with cached TS environments
 */
export function createTwoSlasher(createOptions: CreateTwoSlashOptions = {}): TwoSlashInstance {
  const ts: TS = createOptions.tsModule!
  const tsOptionDeclarations = (ts as any).optionDeclarations as CompilerOptionDeclaration[]

  // In a browser we want to DI everything, in node we can use local infra
  const useFS = !!createOptions.fsMap
  const _root = createOptions.vfsRoot!.replace(/\//g, '/') // Normalize slashes
  const vfs = useFS && createOptions.fsMap ? createOptions.fsMap : new Map<string, string>()
  const system = useFS ? createSystem(vfs) : createFSBackedSystem(vfs, _root, ts, createOptions.tsLibDirectory)
  const fsRoot = useFS ? '/' : `${_root}/`

  const cache = createOptions.cache === false
    ? undefined
    : createOptions.cache instanceof Map
      ? createOptions.cache
      : new Map<string, ReturnType<typeof createVirtualTypeScriptEnvironment>>()

  function getEnv(compilerOptions: CompilerOptions) {
    if (!cache)
      return createVirtualTypeScriptEnvironment(system, [], ts, compilerOptions, createOptions.customTransformers)
    const key = objectHash(compilerOptions)
    if (!cache?.has(key)) {
      const env = createVirtualTypeScriptEnvironment(system, [], ts, compilerOptions, createOptions.customTransformers)
      cache?.set(key, env)
      return env
    }
    return cache.get(key)!
  }

  function twoslasher(
    code: string,
    extension = 'ts',
    options: TwoSlashExecuteOptions = {},
  ): TwoSlashReturn {
    const ext = typesToExtension(extension)
    const defaultFilename = `index.${ext}`

    let tokens: TokenWithoutPosition[] = []
    /** Array of ranges to be striped from the output code */
    let removals: Range[] = []
    const isInRemoval = (index: number) => isInRanges(index, removals)

    const compilerOptions: CompilerOptions = {
      ...defaultCompilerOptions,
      ...createOptions.compilerOptions,
      ...options.compilerOptions,
    }

    const handbookOptions: HandbookOptions = {
      ...defaultHandbookOptions,
      ...createOptions.handbookOptions,
      ...options.handbookOptions,
    }

    const customTags = [
      ...createOptions.customTags || [],
      ...options.customTags || [],
    ]

    const flagNotations: ParsedFlagNotation[] = []

    // #extract compiler options
    Array.from(code.matchAll(reConfigBoolean)).forEach((match) => {
      const index = match.index!
      const name = match[1]
      flagNotations.push(
        parseFlag(name, true, index, index + match[0].length + 1, customTags, tsOptionDeclarations),
      )
    })
    Array.from(code.matchAll(reConfigValue)).forEach((match) => {
      const name = match[1]
      if (name === 'filename')
        return
      const index = match.index!
      const value = match[2]
      flagNotations.push(
        parseFlag(name, value, index, index + match[0].length + 1, customTags, tsOptionDeclarations),
      )
    })

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
        case 'tag':
          tokens.push({
            type: 'tag',
            name: flag.name,
            start: flag.end,
            length: 0,
            text: flag.value,
          })
          break
      }
      removals.push([flag.start, flag.end])
    }

    if (!handbookOptions.noErrorValidation) {
      const unknownFlags = flagNotations.filter(i => i.type === 'unknown')

      if (unknownFlags.length) {
        throw new TwoslashError(
          `Unknown inline compiler flags`,
          unknownFlags.map(i => `@${i.name}`).join(', '),
          `This is likely a typo, you can check all the compiler flags in the TSConfig reference, or check the additional Twoslash flags in the npm page for @typescript/twoslash.`,
        )
      }
    }
    // #endregion

    const env = getEnv(compilerOptions)
    const ls = env.languageService

    const targetsQuery: number[] = []
    const targetsCompletions: number[] = []
    const targetsHighlights: Range[] = []
    const pc = createPositionConverter(code)

    // #region extract cuts
    if (code.includes(cutString))
      removals.push([0, code.indexOf(cutString) + cutString.length])

    if (code.includes(cutAfterString))
      removals.push([code.indexOf(cutAfterString), code.length])

    // #endregion

    const supportedFileTyes = ['js', 'jsx', 'ts', 'tsx']
    const files = splitFiles(code, defaultFilename, fsRoot)

    for (const file of files) {
      // Only run the LSP-y things on source files
      if (file.extension === 'json') {
        if (!compilerOptions.resolveJsonModule)
          continue
      }
      else if (!supportedFileTyes.includes(file.extension)) {
        continue
      }

      env.createFile(file.filename, file.content)

      // #region extract markers
      if (file.content.includes('//')) {
        Array.from(file.content.matchAll(reAnnonateMarkers)).forEach((match) => {
          const type = match[1] as '?' | '|' | '^^'
          const index = match.index! + file.offset
          removals.push([index, index + match[0].length + 1])
          const markerIndex = match[0].indexOf('^')
          const targetIndex = pc.getIndexOfLineAbove(index + markerIndex)
          if (type === '?') {
            targetsQuery.push(targetIndex)
          }
          else if (type === '|') {
            targetsCompletions.push(targetIndex)
          }
          else {
            const markerLength = match[0].lastIndexOf('^') - markerIndex + 1
            targetsHighlights.push([
              targetIndex,
              targetIndex + markerLength,
            ])
          }
        })
      }
      // #endregion

      // #region get ts info for quick info
      const source = ls.getProgram()!.getSourceFile(file.filename)!
      const identifiers = getIdentifierTextSpans(ts, source)
      for (const [offset, target] of identifiers) {
        const start = offset + file.offset
        if (isInRemoval(start))
          continue

        // TODO: hooks to filter out some identifiers
        const quickInfo = ls.getQuickInfoAtPosition(file.filename, offset)

        if (quickInfo && quickInfo.displayParts) {
          const text = quickInfo.displayParts.map(dp => dp.text).join('')

          // TODO: get different type of docs
          const docs = quickInfo.documentation?.map(d => d.text).join('\n') || undefined

          tokens.push({
            type: 'hover',
            text,
            docs,
            start,
            length: target.length,
            target,
          })
        }
      }
      // #endregion

      // #region update token with types
      tokens.forEach((token) => {
        if (token.type as any !== 'hover')
          return undefined
        const range: Range = [token.start, token.start + token.length]
        // Turn static info to query if in range
        if (targetsQuery.find(target => isInRanges(target, [range]))) {
          tokens.push({
            ...token,
            type: 'query',
          } as any)
          // TODO: warn when there is no type info
        }

        // Turn static info to completion if in range
        else if (targetsHighlights.find(target => isInRanges(target[0], [range]) || isInRanges(target[1], [range]))) {
          tokens.push({
            ...token,
            type: 'highlight',
          } as any)
          // TODO: warn when there is no type info
        }
      })
      // #endregion

      // #region get completions
      targetsCompletions.forEach((target) => {
        if (isInRemoval(target))
          return
        const completions = ls.getCompletionsAtPosition(file.filename, target - 1, {})
        if (!completions && !handbookOptions.noErrorValidation) {
          const pos = pc.indexToPos(target)
          throw new TwoslashError(
            `Invalid completion query`,
            `The request on line ${pos} in ${file.filename} for completions via ^| returned no completions from the compiler.`,
            `This is likely that the positioning is off.`,
          )
        }

        let prefix = code.slice(0, target - 1 + 1).match(/\S+$/)?.[0] || ''
        prefix = prefix.split('.').pop()!

        tokens.push({
          type: 'completion',
          start: target,
          length: 0,
          completions: (completions?.entries ?? []).filter(i => i.name.startsWith(prefix)),
          completionsPrefix: prefix,
        })
      })
      // #endregion
    }

    const errorTokens: Omit<TokenError, keyof Position>[] = []

    // #region get diagnostics, after all files are mounted
    for (const file of files) {
      if (!supportedFileTyes.includes(file.extension))
        continue

      if (!handbookOptions.noErrors) {
        const diagnostics = [
          ...ls.getSemanticDiagnostics(file.filename),
          ...ls.getSyntacticDiagnostics(file.filename),
        ]
        for (const diagnostic of diagnostics) {
          if (diagnostic.file?.fileName !== file.filename)
            continue
          const start = diagnostic.start! + file.offset
          if (handbookOptions.noErrorsCutted && isInRemoval(start))
            continue
          errorTokens.push({
            type: 'error',
            start,
            length: diagnostic.length!,
            code: diagnostic.code,
            filename: file.filename,
            id: `err-${diagnostic.code}-${start}-${diagnostic.length}`,
            text: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
            level: diagnostic.category,
          })
        }
      }
    }
    // #endregion

    // A validator that error codes are mentioned, so we can know if something has broken in the future
    if (!handbookOptions.noErrorValidation && errorTokens.length)
      validateCodeForErrors(errorTokens as TokenError[], handbookOptions, fsRoot)

    tokens.push(...errorTokens)

    let outputCode = code
    if (!handbookOptions.keepNotations) {
      const removed = removeCodeRanges(outputCode, removals, tokens)
      outputCode = removed.code
      removals = removed.removals
      tokens = removed.tokens!
    }

    const indexToPos = outputCode === code
      ? pc.indexToPos
      : createPositionConverter(outputCode).indexToPos

    return {
      code: outputCode,
      tokens: resolveTokenPositions(tokens, indexToPos),
      meta: {
        extension: ext,
        compilerOptions,
        handbookOptions,
        removals,
        flagNotations,
      },

      get queries() {
        return this.tokens.filter(i => i.type === 'query') as any
      },
      get completions() {
        return this.tokens.filter(i => i.type === 'completion') as any
      },
      get errors() {
        return this.tokens.filter(i => i.type === 'error') as any
      },
      get highlights() {
        return this.tokens.filter(i => i.type === 'highlight') as any
      },
      get hovers() {
        return this.tokens.filter(i => i.type === 'hover') as any
      },
      get tags() {
        return this.tokens.filter(i => i.type === 'tag') as any
      },
    }
  }

  twoslasher.dispose = () => {
    cache?.clear()
  }

  twoslasher.getCacheMap = () => {
    return cache
  }

  return twoslasher
}

/**
 * Run TwoSlash on a string of code
 *
 * It's recommended to use `createTwoSlash` for better performance on multiple runs
 */
export function twoslasher(code: string, lang?: string, opts?: Partial<TwoSlashOptions>) {
  return createTwoSlasher({
    ...opts,
    cache: false,
  })(code, lang)
}
