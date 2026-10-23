import type { CompilerOptions, CompletionsTriggerCharacter, CompletionTriggerKind, JsxEmit, System } from 'typescript'
import type { IdentifierSpan } from './pipeline'
import type { CompilerOptionDeclaration, CreateTwoslashOptions, TwoslashExecuteOptions, TwoslashInstance, TwoslashOptions, TwoslashReturn, VirtualFile } from './types'
import { createFSBackedSystem, createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs'
import { removeCodeRanges } from 'twoslash-protocol'
import { TwoslashError } from './error'
import { addCompletionNodes, addErrorNodes, addQuickInfoNodes, finalizeRun, getCompletionRequests, getFileContent, getHoverRequests, getOffsetInFile, getRunFiles, prepareRun } from './pipeline'
import { getExtension, getIdentifierTextSpans, getObjectHash, removeTsExtension, splitFiles, typesToExtension } from './utils'

export * from './public'

type TS = typeof import('typescript')

/**
 * Create a Twoslash instance with cached TS environments
 */
export function createTwoslasher(createOptions: CreateTwoslashOptions = {}): TwoslashInstance {
  const ts: TS = createOptions.tsModule!
  const tsMajorVersion = Number(ts.versionMajorMinor.split('.')[0])
  const tsOptionDeclarations = (ts as any).optionDeclarations as CompilerOptionDeclaration[]

  // In a browser we want to DI everything, in node we can use local infra
  const useFS = !!createOptions.fsMap
  const _root = createOptions.vfsRoot!.replace(/\\/g, '/') // Normalize slashes
  const vfs = createOptions.fsMap || new Map<string, string>()
  const system = useFS
    ? createSystem(vfs)
    : createCacheableFSBackedSystem(vfs, _root, ts, createOptions.tsLibDirectory, createOptions.fsCache)
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
    const run = prepareRun(code, extension, options, createOptions, {
      fsRoot,
      optionDeclarations: tsOptionDeclarations,
      // TypeScript removed the baseUrl option in 6.0, paths are resolved relative to pathsBasePath instead
      compilerOptions: tsMajorVersion <= 5 ? { baseUrl: fsRoot } : { pathsBasePath: fsRoot },
    })
    const { meta } = run

    const env = getEnv(meta.compilerOptions)
    const ls = env.languageService

    const identifiersMap = new Map<string, IdentifierSpan[]>()
    function getIdentifiersOfFile(file: VirtualFile) {
      if (!identifiersMap.has(file.filename)) {
        const source = env.getSourceFile(file.filepath)!
        identifiersMap.set(file.filename, getIdentifierTextSpans(source, ts.SyntaxKind.Identifier, file.offset - (file.prepend?.length || 0)))
      }
      return identifiersMap.get(file.filename)!
    }

    const files = getRunFiles(run)
    for (const file of files)
      env.createFile(file.filepath, file.content)

    addQuickInfoNodes(run, getHoverRequests(run, getIdentifiersOfFile), ({ file, start }) => {
      const quickInfo = ls.getQuickInfoAtPosition(file.filepath, getOffsetInFile(start, file))
      if (!quickInfo?.displayParts)
        return
      return {
        text: quickInfo.displayParts.map(dp => dp.text).join(''),
        docs: quickInfo.documentation?.map(d => d.text).join('\n') || undefined,
        tags: quickInfo.tags?.map(t => [t.name, t.text?.map(i => i.text).join('')]),
      }
    })

    addCompletionNodes(run, getCompletionRequests(run), ({ file, offset, triggerCharacter }) => {
      const result = triggerCharacter === undefined
        ? ls.getCompletionsAtPosition(file.filepath, offset, {
            triggerKind: 1 satisfies CompletionTriggerKind.Invoked,
            includeCompletionsForModuleExports: false,
          })
        : ls.getCompletionsAtPosition(file.filepath, offset, {
            triggerKind: 2 satisfies CompletionTriggerKind.TriggerCharacter,
            triggerCharacter: triggerCharacter as CompletionsTriggerCharacter,
            includeCompletionsForModuleExports: false,
          })
      return [...result?.entries ?? []]
    })

    addErrorNodes(run, (file) => {
      env.updateFile(file.filepath, getFileContent(file))
      return [
        ...ls.getSemanticDiagnostics(file.filepath),
        ...ls.getSyntacticDiagnostics(file.filepath),
      ]
        .filter(diagnostic => diagnostic.file?.fileName === file.filepath)
        .map(diagnostic => ({
          start: diagnostic.start!,
          length: diagnostic.length!,
          code: diagnostic.code,
          category: diagnostic.category,
          text: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        }))
    })

    let outputCode = code
    if (meta.handbookOptions.showEmit) {
      if (meta.handbookOptions.keepNotations) {
        throw new TwoslashError(
          `Option 'showEmit' cannot be used with 'keepNotations'`,
          'With `showEmit` enabled, the output will always be the emitted code',
          'Remove either option to continue',
        )
      }
      const { code: removedCode } = removeCodeRanges(outputCode, meta.removals)
      for (const file of splitFiles(removedCode, run.defaultFilename, fsRoot))
        env.updateFile(file.filepath, getFileContent(file))

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
      run.nodes.length = 0
    }

    const result = finalizeRun(run, outputCode)

    // cleanup
    for (const file of files)
      env.createFile(file.filepath, '')

    return result
  }

  twoslasher.getCacheMap = () => {
    return cache
  }

  return twoslasher
}

function createCacheableFSBackedSystem(
  vfs: Map<string, string>,
  root: string,
  ts: TS,
  tsLibDirectory?: string,
  enableFsCache = true,
): System {
  function withCache<T>(fn: (key: string) => T) {
    const cache = new Map<string, T>()
    return (key: string) => {
      const cached = cache.get(key)
      if (cached !== undefined)
        return cached

      const result = fn(key)
      cache.set(key, result)
      return result
    }
  }
  const cachedReadFile = withCache(ts.sys.readFile)

  const cachedTs = enableFsCache
    ? {
        ...ts,
        sys: {
          ...ts.sys,
          directoryExists: withCache(ts.sys.directoryExists),
          fileExists: withCache(ts.sys.fileExists),
          ...(ts.sys.realpath ? { realpath: withCache(ts.sys.realpath) } : {}),
          readFile(path, encoding) {
            if (encoding === undefined)
              return cachedReadFile(path)
            return ts.sys.readFile(path, encoding)
          },
        } satisfies System,
      }
    : ts

  return {
    ...createFSBackedSystem(vfs, root, cachedTs, tsLibDirectory),
    // To work with non-hoisted packages structure
    realpath(path: string) {
      if (vfs.has(path))
        return path
      return cachedTs.sys.realpath?.(path) || path
    },
  }
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
