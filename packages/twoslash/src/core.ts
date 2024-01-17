import type { CompilerOptions, CompletionEntry, CompletionTriggerKind, JsxEmit } from 'typescript'
import { createFSBackedSystem, createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs'
import { TwoslashError } from './error'
import type { CompilerOptionDeclaration, CreateTwoslashOptions, NodeError, NodeWithoutPosition, Position, Range, TwoslashExecuteOptions, TwoslashInstance, TwoslashOptions, TwoslashReturn, TwoslashReturnMeta, VirtualFile } from './types'
import { areRangesIntersecting, createPositionConverter, findCutNotations, findFlagNotations, findQueryMarkers, getExtension, getIdentifierTextSpans, getObjectHash, isInRange, isInRanges, removeCodeRanges, removeTsExtension, resolveNodePositions, splitFiles, typesToExtension } from './utils'
import { validateCodeForErrors } from './validation'
import { defaultCompilerOptions, defaultHandbookOptions } from './defaults'

export * from './public'

type TS = typeof import('typescript')

/**
 * Create a Twoslash instance with cached TS environments
 */
export function createTwoslasher(createOptions: CreateTwoslashOptions = {}): TwoslashInstance {
  const ts: TS = createOptions.tsModule!
  const tsOptionDeclarations = (ts as any).optionDeclarations as CompilerOptionDeclaration[]

  // In a browser we want to DI everything, in node we can use local infra
  const useFS = !!createOptions.fsMap
  const _root = createOptions.vfsRoot!.replace(/\\/g, '/') // Normalize slashes
  const vfs = createOptions.fsMap || new Map<string, string>()
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
    const key = getObjectHash(compilerOptions)
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
    options: TwoslashExecuteOptions = {},
  ): TwoslashReturn {
    const meta: TwoslashReturnMeta = {
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
      virtualFiles: [],
      positionQueries: options.positionQueries || [],
      positionCompletions: options.positionCompletions || [],
      positionHighlights: options.positionHighlights || [],
    }
    const {
      customTags = createOptions.customTags || [],
      shouldGetHoverInfo = createOptions.shouldGetHoverInfo || (() => true),
      filterNode = createOptions.filterNode,
    } = options

    const defaultFilename = `index.${meta.extension}`
    let nodes: NodeWithoutPosition[] = []
    const isInRemoval = (index: number) => index >= code.length || index < 0 || isInRanges(index, meta.removals)

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

    // extract cuts
    meta.removals.push(...findCutNotations(code))
    // extract markers
    findQueryMarkers(code, meta, pc.getIndexOfLineAbove)

    const supportedFileTyes = ['js', 'jsx', 'ts', 'tsx']
    meta.virtualFiles = splitFiles(code, defaultFilename, fsRoot)
    const identifiersMap = new Map<string, ReturnType<typeof getIdentifierTextSpans>>()

    function getIdentifiersOfFile(file: VirtualFile) {
      if (!identifiersMap.has(file.filename)) {
        const source = env.getSourceFile(file.filepath)!
        identifiersMap.set(file.filename, getIdentifierTextSpans(ts, source, file.offset))
      }
      return identifiersMap.get(file.filename)!
    }

    function getFileAtPosition(pos: number) {
      return meta.virtualFiles.find(i => isInRange(pos, [i.offset, i.offset + i.content.length]))
    }

    function getQuickInfo(file: VirtualFile, start: number, target: string): NodeWithoutPosition | undefined {
      const quickInfo = ls.getQuickInfoAtPosition(file.filepath, start - file.offset)

      if (quickInfo && quickInfo.displayParts) {
        const text = quickInfo.displayParts.map(dp => dp.text).join('')

        const docs = quickInfo.documentation?.map(d => d.text).join('\n') || undefined
        const tags = quickInfo.tags?.map(t => [t.name, t.text?.map(i => i.text).join('')] as [string, string | undefined])

        return {
          type: 'hover',
          text,
          docs,
          tags,
          start,
          length: target.length,
          target,
        }
      }
    }

    // # region write files into the FS
    for (const file of meta.virtualFiles) {
      // Only run the LSP-y things on source files
      if (supportedFileTyes.includes(file.extension) || (file.extension === 'json' && meta.compilerOptions.resolveJsonModule)) {
        file.supportLsp = true
        env.createFile(file.filepath, file.content)
        getIdentifiersOfFile(file)
      }
    }
    // #endregion

    if (!meta.handbookOptions.showEmit) {
      for (const file of meta.virtualFiles) {
        if (!file.supportLsp)
          continue

        // #region get ts info for quick info
        if (!meta.handbookOptions.noStaticSemanticInfo) {
          const identifiers = getIdentifiersOfFile(file)
          for (const [start, _end, target] of identifiers) {
            if (isInRemoval(start))
              continue
            if (!shouldGetHoverInfo(target, start, file.filename))
              continue
            const node = getQuickInfo(file, start, target)
            if (node)
              nodes.push(node)
          }
        }
      }
      // #endregion

      // #region get query
      for (const query of meta.positionQueries) {
        if (isInRemoval(query)) {
          throw new TwoslashError(
            `Invalid quick info query`,
            `The request on line ${pc.indexToPos(query).line + 2} for quickinfo via ^? is in a removal range.`,
            `This is likely that the positioning is off.`,
          )
        }

        const file = getFileAtPosition(query)!
        const identifiers = getIdentifiersOfFile(file)

        const id = identifiers.find(i => isInRange(query, i as unknown as Range))
        let node: NodeWithoutPosition | undefined
        if (id)
          node = getQuickInfo(file, id[0], id[2])

        if (node) {
          node.type = 'query'
          nodes.push(node)
        }
        else {
          const pos = pc.indexToPos(query)
          throw new TwoslashError(
            `Invalid quick info query`,
            `The request on line ${pos.line + 2} in ${file.filename} for quickinfo via ^? returned nothing from the compiler.`,
            `This is likely that the positioning is off.`,
          )
        }
      }
      // #endregion

      // #region get highlights
      for (const highlight of meta.positionHighlights) {
        if (isInRemoval(highlight[0])) {
          throw new TwoslashError(
            `Invalid highlight query`,
            `The request on line ${pc.indexToPos(highlight[0]).line + 2} for highlight via ^^^ is in a removal range.`,
            `This is likely that the positioning is off.`,
          )
        }

        const file = getFileAtPosition(highlight[0])!
        const identifiers = getIdentifiersOfFile(file)

        const ids = identifiers.filter(i => areRangesIntersecting(i as unknown as Range, highlight))
        const matched = ids
          .map(i => getQuickInfo(file, i[0], i[2]))
          .filter(Boolean) as NodeWithoutPosition[]
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
            `The request on line ${pos.line + 2} in ${file.filename} for highlight via ^^^ is returned nothing from the compiler.`,
            `This is likely that the positioning is off.`,
          )
        }
      }
      // #endregion

      // #region get completions
      for (const target of meta.positionCompletions) {
        const file = getFileAtPosition(target)!
        if (isInRemoval(target) || !file) {
          throw new TwoslashError(
            `Invalid completion query`,
            `The request on line ${pc.indexToPos(target).line + 2} for completions via ^| is in a removal range.`,
            `This is likely that the positioning is off.`,
          )
        }

        let prefix = code.slice(0, target).match(/[$_\w]+$/)?.[0] || ''
        prefix = prefix.split('.').pop()!

        let completions: CompletionEntry[] = []
        // If matched with an identifier prefix
        if (prefix) {
          const result = ls.getCompletionsAtPosition(file.filepath, target - file.offset - 1, {
            triggerKind: 1 satisfies CompletionTriggerKind.Invoked,
            includeCompletionsForModuleExports: false,
          })
          completions = (result?.entries ?? []).filter(i => i.name.startsWith(prefix)) || []
        }
        // If not, we try to trigger with character (e.g. `.`, `'`, `"`)
        else {
          prefix = code[target - 1]
          if (prefix) {
            const result = ls.getCompletionsAtPosition(file.filepath, target - file.offset, {
              triggerKind: 2 satisfies CompletionTriggerKind.TriggerCharacter,
              triggerCharacter: prefix as any,
              includeCompletionsForModuleExports: false,
            })
            completions = result?.entries ?? []
          }
        }

        if (!completions?.length && !meta.handbookOptions.noErrorValidation) {
          const pos = pc.indexToPos(target)
          throw new TwoslashError(
            `Invalid completion query`,
            `The request on line ${pos.line} in ${file.filename} for completions via ^| returned no completions from the compiler.`,
            `This is likely that the positioning is off.`,
          )
        }

        nodes.push({
          type: 'completion',
          start: target,
          length: 0,
          completions,
          completionsPrefix: prefix,
        })
      }
      // #endregion
    }

    let errorNodes: Omit<NodeError, keyof Position>[] = []

    // #region get diagnostics, after all files are mounted
    for (const file of meta.virtualFiles) {
      if (!file.supportLsp)
        continue

      if (meta.handbookOptions.noErrors !== true) {
        env.updateFile(file.filepath, file.content)
        const diagnostics = [
          ...ls.getSemanticDiagnostics(file.filepath),
          ...ls.getSyntacticDiagnostics(file.filepath),
        ]
        const ignores = Array.isArray(meta.handbookOptions.noErrors)
          ? meta.handbookOptions.noErrors
          : []
        for (const diagnostic of diagnostics) {
          if (diagnostic.file?.fileName !== file.filepath)
            continue
          if (ignores.includes(diagnostic.code))
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
      if (meta.handbookOptions.keepNotations) {
        throw new TwoslashError(
          `Option 'showEmit' cannot be used with 'keepNotations'`,
          'With `showEmit` enabled, the output will always be the emitted code',
          'Remove either option to continue',
        )
      }
      if (!meta.handbookOptions.keepNotations) {
        const { code: removedCode } = removeCodeRanges(outputCode, meta.removals)
        const files = splitFiles(removedCode, defaultFilename, fsRoot)
        for (const file of files)
          env.updateFile(file.filepath, file.content)
      }

      const emitFilename = meta.handbookOptions.showEmittedFile
        ? meta.handbookOptions.showEmittedFile
        : meta.compilerOptions.jsx === 1 satisfies JsxEmit.Preserve
          ? 'index.jsx'
          : 'index.js'

      let emitSource = meta.virtualFiles.find(i => removeTsExtension(i.filename) === removeTsExtension(emitFilename))?.filename

      if (!emitSource && !meta.compilerOptions.outFile) {
        const allFiles = meta.virtualFiles.map(i => i.filename).join(', ')
        throw new TwoslashError(
          `Could not find source file to show the emit for`,
          `Cannot find the corresponding **source** file: '${emitFilename}'`,
          `Looked for: ${emitSource} in the vfs - which contains: ${allFiles}`,
        )
      }

      // Allow outfile, in which case you need any file.
      if (meta.compilerOptions.outFile)
        emitSource = meta.virtualFiles[0].filename

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
      meta.extension = typesToExtension(getExtension(outfile.name))
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
 * Run Twoslash on a string of code
 *
 * It's recommended to use `createTwoslash` for better performance on multiple runs
 */
export function twoslasher(code: string, lang?: string, opts?: Partial<TwoslashOptions>) {
  return createTwoslasher({
    ...opts,
    cache: false,
  })(code, lang)
}
