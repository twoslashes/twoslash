import type { CompilerOptions, ScriptTarget } from 'typescript'
import { createFSBackedSystem, createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs'
import { objectHash } from 'ohash'
import { TwoslashError } from './error'
import type { CreateTwoSlashOptions, HandbookOptions, Range, Token, TokenError, TokenWithoutPosition, TwoSlashExecuteOptions, TwoSlashInstance, TwoSlashOptions, TwoSlashReturn } from './types'
import { createPositionConverter, getIdentifierTextSpans, getOptionValueFromMap, isInRanges, mergeRanges, parsePrimitive, splitFiles, typesToExtension } from './utils'
import { validateCodeForErrors } from './validation'

export * from './error'
export * from './types'

type TS = typeof import('typescript')

// TODO: Make them configurable maybe
const reConfigBoolean = /^\/\/\s?@(\w+)$/mg
const reConfigValue = /^\/\/\s?@(\w+):\s?(.+)$/mg
const reAnnonateMarkers = /^\s*\/\/\s*\^(\?|\||\^+)( .*)?\n?$/mg

const cutString = '// ---cut---\n'
const cutAfterString = '// ---cut-after---\n'
// TODO: cut range

interface OptionDeclaration {
  name: string
  type: 'list' | 'boolean' | 'number' | 'string' | Map<string, any>
  element?: OptionDeclaration
}

/**
 * Create a TwoSlash instance with cached TS environments
 */
export function createTwoSlasher(createOptions: CreateTwoSlashOptions = {}): TwoSlashInstance {
  const ts: TS = createOptions.tsModule!
  const tsOptionDeclarations = (ts as any).optionDeclarations as OptionDeclaration[]

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

    const _tokens: TokenWithoutPosition[] = []
    /** Array of ranges to be striped from the output code */
    let removals: Range[] = []
    const isInRemoval = (index: number) => isInRanges(index, removals)

    const compilerOptions: CompilerOptions = {
      strict: true,
      target: 99 satisfies ScriptTarget.ESNext,
      allowJs: true,
      skipDefaultLibCheck: true,
      skipLibCheck: true,
      ...createOptions.compilerOptions,
      ...options.compilerOptions,
    }

    const handbookOptions: HandbookOptions = {
      errors: [],
      noErrors: false,
      showEmit: false,
      showEmittedFile: undefined,
      noStaticSemanticInfo: false,
      emit: false,
      noErrorValidation: false,
      keepNotations: true,
      ...createOptions.handbookOptions,
      ...options.handbookOptions,
    }

    const customTags = [
      ...createOptions.customTags || [],
      ...options.customTags || [],
    ]

    function updateOptions(name: string, value: any): false | void {
      const oc = tsOptionDeclarations.find(d => d.name.toLocaleLowerCase() === name.toLocaleLowerCase())
      // if it's compilerOptions
      if (oc) {
        switch (oc.type) {
          case 'number':
          case 'string':
          case 'boolean':
            compilerOptions[oc.name] = parsePrimitive(value, oc.type)
            break
          case 'list': {
            const elementType = oc.element!.type
            const strings = value.split(',') as string[]
            if (typeof elementType === 'string')
              compilerOptions[oc.name] = strings.map(v => parsePrimitive(v, elementType))
            else
              compilerOptions[oc.name] = strings.map(v => getOptionValueFromMap(oc.name, v, elementType as Map<string, string>))

            break
          }
          default:
            // It's a map
            compilerOptions[oc.name] = getOptionValueFromMap(oc.name, value, oc.type)
            break
        }
      }
      // if it's handbookOptions
      else if (Object.keys(handbookOptions).includes(name)) {
        // "errors" is a special case, it's a list of numbers
        if (name === 'errors' && typeof value === 'string')
          value = value.split(' ').map(Number);

        (handbookOptions as any)[name] = value
      }
      // throw errors if it's not a valid compiler flag
      else {
        if (handbookOptions.noErrorValidation)
          return false
        throw new TwoslashError(
          `Invalid inline compiler flag`,
          `There isn't a TypeScript compiler flag called '@${name}'.`,
          `This is likely a typo, you can check all the compiler flags in the TSConfig reference, or check the additional Twoslash flags in the npm page for @typescript/twoslash.`,
        )
      }
    }

    // #extract compiler options
    Array.from(code.matchAll(reConfigBoolean)).forEach((match) => {
      const index = match.index!
      const name = match[1]
      if (updateOptions(name, true) === false)
        return
      removals.push([index, index + match[0].length + 1])
    })
    Array.from(code.matchAll(reConfigValue)).forEach((match) => {
      const index = match.index!
      const name = match[1]
      if (name === 'filename')
        return
      const value = match[2]
      if (customTags.includes(name)) {
        _tokens.push({
          type: 'tag',
          name,
          start: index + match[0].length + 1,
          length: 0,
          text: match[0].split(':')[1].trim(),
        })
      }
      else {
        if (updateOptions(name, value) === false)
          return
      }
      removals.push([index, index + match[0].length + 1])
    })
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

          _tokens.push({
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
      _tokens.forEach((token) => {
        if (token.type as any !== 'hover')
          return undefined
        const range: Range = [token.start, token.start + token.length]
        // Turn static info to query if in range
        if (targetsQuery.find(target => isInRanges(target, [range])))
          token.type = 'query'

        // Turn static info to completion if in range
        else if (targetsHighlights.find(target => isInRanges(target[0], [range]) || isInRanges(target[1], [range])))
          token.type = 'highlight'
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

        _tokens.push({
          type: 'completion',
          start: target,
          length: 0,
          completions: (completions?.entries ?? []).filter(i => i.name.startsWith(prefix)),
          completionsPrefix: prefix,
        })
      })
      // #endregion
    }

    // #region get diagnostics, after all files are mounted
    for (const file of files) {
      if (!supportedFileTyes.includes(file.extension))
        continue

      if (!handbookOptions.noErrorValidation && !handbookOptions.noErrors) {
        const diagnostics = [
          ...ls.getSemanticDiagnostics(file.filename),
          ...ls.getSyntacticDiagnostics(file.filename),
        ]
          .filter(i => i.file?.fileName === file.filename)

        for (const diagnostic of diagnostics) {
          const start = diagnostic.start! + file.offset
          const renderedMessage = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
          const id = `err-${diagnostic.code}-${diagnostic.start}-${diagnostic.length}`

          _tokens.push({
            type: 'error',
            start,
            length: diagnostic.length!,
            code: diagnostic.code,
            filename: file.filename,
            id,
            text: renderedMessage,
            level: diagnostic.category,
          })
        }
      }
    }
    // #endregion

    // A validator that error codes are mentioned, so we can know if something has broken in the future
    const errors = _tokens.filter(i => i.type === 'error') as TokenError[]
    if (!handbookOptions.noErrorValidation && errors.length)
      validateCodeForErrors(errors, handbookOptions, fsRoot)

    // Sort descending, so that we start removal from the end
    removals = mergeRanges(removals)
      .sort((a, b) => b[0] - a[0])

    let outputCode = code
    if (handbookOptions.keepNotations) {
      for (const remove of removals) {
        const removalLength = remove[1] - remove[0]
        outputCode = outputCode.slice(0, remove[0]) + outputCode.slice(remove[1])
        _tokens.forEach((token) => {
          // tokens before the range, do nothing
          if (token.start + token.length <= remove[0])
            return undefined

          // remove tokens that are within in the range
          else if (token.start < remove[1])
            token.start = -1

          // move tokens after the range forward
          else
            token.start -= removalLength
        })
      }
    }

    const resultPC = outputCode === code
      ? pc // reuse the converter if nothing changed
      : createPositionConverter(outputCode)

    const tokens = _tokens
      .filter(token => token.start >= 0)
      .sort((a, b) => a.start - b.start) as Token[]

    tokens
      .forEach((token) => {
        Object.assign(token, resultPC.indexToPos(token.start))
      })

    return {
      code: outputCode,
      tokens,
      meta: {
        extension: ext,
        compilerOptions,
        handbookOptions,
        removals,
      },

      get queries() {
        return tokens.filter(i => i.type === 'query') as any
      },
      get completions() {
        return tokens.filter(i => i.type === 'completion') as any
      },
      get errors() {
        return tokens.filter(i => i.type === 'error') as any
      },
      get highlights() {
        return tokens.filter(i => i.type === 'highlight') as any
      },
      get hovers() {
        return tokens.filter(i => i.type === 'hover') as any
      },
      get tags() {
        return tokens.filter(i => i.type === 'tag') as any
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
