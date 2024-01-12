import type { CompilerOptions, JsxEmit } from 'typescript'
import { createFSBackedSystem, createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs'
import { objectHash } from 'ohash'
import { TwoslashError } from './error'
import type { CompilerOptionDeclaration, CreateTwoSlashOptions, HandbookOptions, NodeError, NodeErrorWithoutPosition, NodeHover, NodeWithoutPosition, ParsedFlagNotation, Position, Range, TwoSlashExecuteOptions, TwoSlashInstance, TwoSlashOptions, TwoSlashReturn, TwoSlashReturnMeta } from './types'
import { areRangesIntersecting, createPositionConverter, getExtension, getIdentifierTextSpans, isInRange, isInRanges, parseFlag, removeCodeRanges, resolveNodePositions, splitFiles, typesToExtension } from './utils'
import { validateCodeForErrors } from './validation'
import { defaultCompilerOptions, defaultHandbookOptions } from './defaults'

export * from './public'

type TS = typeof import('typescript')

// TODO: Make them configurable maybe
const reConfigBoolean = /^\/\/\s?@(\w+)$/mg
const reConfigValue = /^\/\/\s?@(\w+):\s?(.+)$/mg
const reAnnonateMarkers = /^\s*\/\/\s*\^(\?|\||\^+)( .*)?$/mg

const cutString = '// ---cut---\n'
const cutAfterString = '// ---cut-after---\n'
// TODO: feat cut range

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
    const meta: TwoSlashReturnMeta = {
      extension: typesToExtension(extension),
      compilerOptions: {
        ...defaultCompilerOptions,
        ...createOptions.compilerOptions,
        ...options.compilerOptions,
      },
      handbookOptions: {
        ...defaultHandbookOptions,
        ...createOptions.handbookOptions,
        ...options.handbookOptions,
      },
      removals: [],
      flagNotations: [],
    }
    const {
      customTags = createOptions.customTags || [],
      shouldGetHoverInfo = createOptions.shouldGetHoverInfo || (() => true),
      filterNode = createOptions.filterNode,
    } = options

    const defaultFilename = `index.${meta.extension}`
    let nodes: NodeWithoutPosition[] = []
    const isInRemoval = (index: number) => isInRanges(index, meta.removals)

    meta.flagNotations = findFlagNotations(code, customTags, tsOptionDeclarations)

    // #region apply flags
    for (const flag of meta.flagNotations) {
      switch (flag.type) {
        case 'unknown':
          continue

        case 'compilerOptions':
          meta.compilerOptions[flag.name] = flag.value
          break
        case 'handbookOptions':
          // @ts-expect-error -- this is fine
          meta.handbookOptions[flag.name] = flag.value
          break
        case 'tag':
          nodes.push({
            type: 'tag',
            name: flag.name,
            start: flag.end,
            length: 0,
            text: flag.value,
          })
          break
      }
      meta.removals.push([flag.start, flag.end])
    }

    if (!meta.handbookOptions.noErrorValidation) {
      const unknownFlags = meta.flagNotations.filter(i => i.type === 'unknown')
      if (unknownFlags.length) {
        throw new TwoslashError(
          `Unknown inline compiler flags`,
          `The following flags are either valid TSConfig nor handbook options:\n${unknownFlags.map(i => `@${i.name}`).join(', ')}`,
          `This is likely a typo, you can check all the compiler flags in the TSConfig reference, or check the additional Twoslash flags in the npm page for @typescript/twoslash.`,
        )
      }
    }
    // #endregion

    const env = getEnv(meta.compilerOptions)
    const ls = env.languageService
    const pc = createPositionConverter(code)

    // #region extract cuts
    if (code.includes(cutString))
      meta.removals.push([0, code.indexOf(cutString) + cutString.length])

    if (code.includes(cutAfterString))
      meta.removals.push([code.indexOf(cutAfterString), code.length])
    // #endregion

    const supportedFileTyes = ['js', 'jsx', 'ts', 'tsx']
    const files = splitFiles(code, defaultFilename)

    for (const file of files) {
      // Only run the LSP-y things on source files
      if (file.extension === 'json') {
        if (!meta.compilerOptions.resolveJsonModule)
          continue
      }
      else if (!supportedFileTyes.includes(file.extension)) {
        continue
      }

      const filepath = fsRoot + file.filename

      env.createFile(filepath, file.content)

      if (!meta.handbookOptions.showEmit) {
        const targetsQuery: number[] = []
        const targetsCompletions: number[] = []
        const targetsHighlights: Range[] = []
        const source = ls.getProgram()!.getSourceFile(filepath)!

        // #region extract markers
        if (file.content.includes('//')) {
          Array.from(file.content.matchAll(reAnnonateMarkers)).forEach((match) => {
            const type = match[1] as '?' | '|' | '^^'
            const index = match.index! + file.offset
            meta.removals.push([index, index + match[0].length + 1])
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
        function getQuickInfo(start: number, target: string): NodeWithoutPosition | undefined {
          const quickInfo = ls.getQuickInfoAtPosition(filepath, start - file.offset)

          if (quickInfo && quickInfo.displayParts) {
            const text = quickInfo.displayParts.map(dp => dp.text).join('')

            // TODO: get different type of docs
            const docs = quickInfo.documentation?.map(d => d.text).join('\n') || undefined

            return {
              type: 'hover',
              text,
              docs,
              start,
              length: target.length,
              target,
            }
          }
        }

        let identifiers: ReturnType<typeof getIdentifierTextSpans> | undefined
        if (!meta.handbookOptions.noStaticSemanticInfo) {
          identifiers = getIdentifierTextSpans(ts, source, file.offset)
          for (const [start, _end, target] of identifiers) {
            if (isInRemoval(start))
              continue
            if (!shouldGetHoverInfo(target, start, file.filename))
              continue

            const node = getQuickInfo(start, target)
            if (node)
              nodes.push(node)
          }
        }
        // #endregion

        // #region get query
        for (const query of targetsQuery) {
          if (!identifiers)
            identifiers = getIdentifierTextSpans(ts, source, file.offset)

          const id = identifiers.find(i => isInRange(query, i as unknown as Range))
          let node: NodeWithoutPosition | undefined
          if (id)
            node = getQuickInfo(query, id[2])
          if (node) {
            node.type = 'query'
            nodes.push(node)
          }
          else {
            const pos = pc.indexToPos(query)
            throw new TwoslashError(
            `Invalid quick info query`,
            `The request on line ${pos.line + 2} in ${file.filename} for quickinfo via ^? returned nothing from the compiler.`,
            `This is likely that the x positioning is off.`,
            )
          }
        }
        // #endregion

        // #region get highlights
        for (const highlight of targetsHighlights) {
          if (!identifiers)
            identifiers = getIdentifierTextSpans(ts, source, file.offset)

          const ids = identifiers.filter(i => areRangesIntersecting(i as unknown as Range, highlight))
          const matched = ids.map(i => getQuickInfo(i[0], i[2])).filter(Boolean) as NodeWithoutPosition[]
          if (matched.length) {
            for (const node of matched) {
              node.type = 'highlight'
              nodes.push(node)
            }
          }
          else {
            const pos = pc.indexToPos(highlight[0])
            throw new TwoslashError(
            `Invalid highlight query`,
            `The request on line ${pos.line + 2} in ${file.filename} for highlight via ^^^ returned nothing from the compiler.`,
            `This is likely that the x positioning is off.`,
            )
          }
        }
        // #endregion

        // #region get completions
        targetsCompletions.forEach((target) => {
          if (isInRemoval(target))
            return
          const completions = ls.getCompletionsAtPosition(filepath, target - 1, {})
          if (!completions && !meta.handbookOptions.noErrorValidation) {
            const pos = pc.indexToPos(target)
            throw new TwoslashError(
            `Invalid completion query`,
            `The request on line ${pos} in ${file.filename} for completions via ^| returned no completions from the compiler.`,
            `This is likely that the positioning is off.`,
            )
          }

          let prefix = code.slice(0, target - 1 + 1).match(/\S+$/)?.[0] || ''
          prefix = prefix.split('.').pop()!

          nodes.push({
            type: 'completion',
            start: target,
            length: 0,
            completions: (completions?.entries ?? []).filter(i => i.name.startsWith(prefix)),
            completionsPrefix: prefix,
          })
        })
        // #endregion
      }
    }

    let errorNodes: Omit<NodeError, keyof Position>[] = []

    // #region get diagnostics, after all files are mounted
    for (const file of files) {
      if (!supportedFileTyes.includes(file.extension))
        continue

      const filepath = fsRoot + file.filename
      if (!meta.handbookOptions.noErrors) {
        const diagnostics = [
          ...ls.getSemanticDiagnostics(filepath),
          ...ls.getSyntacticDiagnostics(filepath),
        ]
        for (const diagnostic of diagnostics) {
          if (diagnostic.file?.fileName !== filepath)
            continue
          const start = diagnostic.start! + file.offset
          if (meta.handbookOptions.noErrorsCutted && isInRemoval(start))
            continue
          errorNodes.push({
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

    if (filterNode) {
      nodes = nodes.filter(filterNode)
      errorNodes = errorNodes.filter(filterNode)
    }
    nodes.push(...errorNodes)

    // A validator that error codes are mentioned, so we can know if something has broken in the future
    if (!meta.handbookOptions.noErrorValidation && errorNodes.length)
      validateCodeForErrors(errorNodes as NodeError[], meta.handbookOptions, fsRoot)

    let outputCode = code
    if (meta.handbookOptions.showEmit) {
      if (!meta.handbookOptions.keepNotations) {
        const { code: removedCode } = removeCodeRanges(outputCode, meta.removals)
        const files = splitFiles(removedCode, defaultFilename)
        for (const file of files) {
          const filepath = fsRoot + file.filename
          env.updateFile(filepath, file.content)
        }
      }
      function removeExt(filename: string) {
        return filename.replace(/\.[^/.]+$/, '').replace(/\.d$/, '')
      }

      const filenames = files.map(i => i.filename)
      const emitFilename = meta.handbookOptions.showEmittedFile
        ? meta.handbookOptions.showEmittedFile
        : meta.compilerOptions.jsx === 1 satisfies JsxEmit.Preserve
          ? 'index.jsx'
          : 'index.js'
      let emitSource = files.find(i => removeExt(i.filename) === removeExt(emitFilename))?.filename

      if (!emitSource && !meta.compilerOptions.outFile) {
        const allFiles = filenames.join(', ')
        throw new TwoslashError(
          `Could not find source file to show the emit for`,
          `Cannot find the corresponding **source** file  ${emitFilename} for completions via ^| returned no quickinfo from the compiler.`,
          `Looked for: ${emitFilename} in the vfs - which contains: ${allFiles}`,
        )
      }

      // Allow outfile, in which case you need any file.
      if (meta.compilerOptions.outFile)
        emitSource = filenames[0]

      const output = ls.getEmitOutput(fsRoot + emitSource)
      const outfile = output.outputFiles
        .find(o => o.name === fsRoot + emitFilename || o.name === emitFilename)

      if (!outfile) {
        const allFiles = output.outputFiles.map(o => o.name).join(', ')
        throw new TwoslashError(
          `Cannot find the output file in the Twoslash VFS`,
          `Looking for ${emitFilename} in the Twoslash vfs after compiling`,
          `Looked for" ${fsRoot + emitFilename} in the vfs - which contains ${allFiles}.`,
        )
      }

      outputCode = outfile.text
      meta.extension = getExtension(outfile.name)
      meta.removals.length = 0
      nodes.length = 0
    }

    if (!meta.handbookOptions.keepNotations) {
      const removed = removeCodeRanges(outputCode, meta.removals, nodes)
      outputCode = removed.code
      nodes = removed.nodes
      meta.removals = removed.removals
    }

    const indexToPos = outputCode === code
      ? pc.indexToPos
      : createPositionConverter(outputCode).indexToPos

    const resolvedNodes = resolveNodePositions(nodes, indexToPos)

    return {
      code: outputCode,
      nodes: resolvedNodes,
      meta,

      get queries() {
        return this.nodes.filter(i => i.type === 'query') as any
      },
      get completions() {
        return this.nodes.filter(i => i.type === 'completion') as any
      },
      get errors() {
        return this.nodes.filter(i => i.type === 'error') as any
      },
      get highlights() {
        return this.nodes.filter(i => i.type === 'highlight') as any
      },
      get hovers() {
        return this.nodes.filter(i => i.type === 'hover') as any
      },
      get tags() {
        return this.nodes.filter(i => i.type === 'tag') as any
      },
    }
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

function findFlagNotations(code: string, customTags: string[], tsOptionDeclarations: CompilerOptionDeclaration[]) {
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
  return flagNotations
}
