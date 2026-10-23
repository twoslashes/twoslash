import type { CompletionEntry, ErrorLevel, NodeError, NodeWithoutPosition, Position, Range } from 'twoslash-protocol'
import type { CompilerOptions } from 'typescript'
import type { CompilerOptionDeclaration, CreateTwoslashOptions, ExtraFiles, TwoslashExecuteOptions, TwoslashReturn, TwoslashReturnMeta, VirtualFile } from './types'
import { createPositionConverter, isInRange, isInRanges, removeCodeRanges, resolveNodePositions } from 'twoslash-protocol'
import { defaultCompilerOptions, defaultHandbookOptions } from './defaults'
import { TwoslashError } from './error'
import { findCutNotations, findFlagNotations, findQueryMarkers, splitFiles, typesToExtension } from './utils'
import { validateCodeForErrors } from './validation'

export type IdentifierSpan = [start: number, end: number, text: string]

export interface QuickInfo {
  text: string
  docs?: string
  tags?: [name: string, text: string | undefined][]
}

export interface HoverRequest {
  file: VirtualFile
  start: number
  target: string
}

export interface CompletionRequest {
  file: VirtualFile
  target: number
  prefix: string
  /** Offset in the file content to request completions at */
  offset: number
  /** Set when there is no identifier prefix, to trigger with the previous character instead */
  triggerCharacter?: string
}

export interface Completion extends CompletionEntry {
  replacementSpan?: { start: number, length: number }
}

export interface Diagnostic {
  /** Offset in the file content */
  start: number
  length: number
  code: number
  category: number
  text: string
}

export interface TwoslashRun {
  code: string
  meta: TwoslashReturnMeta
  nodes: NodeWithoutPosition[]
  defaultFilename: string
  extraFiles: ExtraFiles
  fsRoot: string
  shouldGetHoverInfo: NonNullable<TwoslashExecuteOptions['shouldGetHoverInfo']>
  filterNode: TwoslashExecuteOptions['filterNode']
  indexToPos: (index: number) => Position
  isInRemoval: (index: number) => boolean
}

export interface PrepareRunContext {
  fsRoot: string
  /** Compiler options specific to the TypeScript version, applied before user options */
  compilerOptions: CompilerOptions
  optionDeclarations: CompilerOptionDeclaration[]
}

const supportedFileTypes = ['js', 'jsx', 'ts', 'tsx']

/**
 * Parse the notations of a code sample and split it into virtual files, ready to be fed into a language service
 */
export function prepareRun(
  code: string,
  extension: string,
  options: TwoslashExecuteOptions,
  createOptions: CreateTwoslashOptions,
  context: PrepareRunContext,
): TwoslashRun {
  const meta: TwoslashReturnMeta = {
    extension: typesToExtension(extension),
    compilerOptions: {
      ...defaultCompilerOptions,
      ...context.compilerOptions,
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
    extraFiles = createOptions.extraFiles || {},
  } = options

  const nodes: NodeWithoutPosition[] = []

  meta.flagNotations = findFlagNotations(code, customTags, context.optionDeclarations)

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

  const pc = createPositionConverter(code)

  // extract cuts
  findCutNotations(code, meta)
  // extract markers
  findQueryMarkers(code, meta, pc)

  const defaultFilename = `index.${meta.extension}`
  meta.virtualFiles = splitFiles(code, defaultFilename, context.fsRoot)
  for (const file of meta.virtualFiles) {
    // Only run the LSP-y things on source files
    if (supportedFileTypes.includes(file.extension) || (file.extension === 'json' && meta.compilerOptions.resolveJsonModule)) {
      file.supportLsp = true
      const extra = extraFiles[file.filename]
      if (extra && typeof extra !== 'string') {
        file.append = extra.append
        file.prepend = extra.prepend
      }
    }
  }

  return {
    code,
    meta,
    nodes,
    defaultFilename,
    extraFiles,
    fsRoot: context.fsRoot,
    shouldGetHoverInfo,
    filterNode,
    indexToPos: pc.indexToPos,
    isInRemoval: (index: number) => index >= code.length || index < 0 || !!isInRanges(index, meta.removals, false),
  }
}

export function getFileContent(file: VirtualFile) {
  return (file.prepend || '') + file.content + (file.append || '')
}

export function getOffsetInFile(offset: number, file: VirtualFile) {
  return offset - file.offset + (file.prepend?.length || 0)
}

/**
 * Files that need to be written into the language service, including extra files that are not part of the code
 */
export function getRunFiles(run: TwoslashRun) {
  const files: { filepath: string, content: string }[] = []
  for (const [filename, content] of Object.entries(run.extraFiles)) {
    if (!run.meta.virtualFiles.some(i => i.filename === filename)) {
      files.push({
        filepath: run.fsRoot + filename,
        content: typeof content === 'string' ? content : (content.prepend || '') + (content.append || ''),
      })
    }
  }
  for (const file of run.meta.virtualFiles) {
    if (file.supportLsp)
      files.push({ filepath: file.filepath, content: getFileContent(file) })
  }
  return files
}

function getFileAtPosition(run: TwoslashRun, pos: number) {
  return run.meta.virtualFiles.find(i => isInRange(pos, [i.offset, i.offset + i.content.length]))
}

export function getHoverRequests(run: TwoslashRun, getIdentifiers: (file: VirtualFile) => IdentifierSpan[]) {
  const hovers: HoverRequest[] = []
  const queries: HoverRequest[] = []
  const { meta, isInRemoval } = run

  if (meta.handbookOptions.showEmit)
    return { hovers, queries }

  if (!meta.handbookOptions.noStaticSemanticInfo) {
    for (const file of meta.virtualFiles) {
      if (!file.supportLsp)
        continue
      for (const [start, _end, target] of getIdentifiers(file)) {
        if (isInRemoval(start))
          continue
        if (!run.shouldGetHoverInfo(target, start, file.filename))
          continue
        hovers.push({ file, start, target })
      }
    }
  }

  for (const query of meta.positionQueries) {
    if (isInRemoval(query)) {
      throw new TwoslashError(
        `Invalid quick info query`,
        `The request on line ${run.indexToPos(query).line + 2} for quickinfo via ^? is in a removal range.`,
        `This is likely that the positioning is off.`,
      )
    }

    const file = getFileAtPosition(run, query)!
    const id = getIdentifiers(file).find(i => isInRange(query, i as unknown as Range))
    if (!id)
      throwEmptyQuery(run, query, file)
    queries.push({ file, start: id[0], target: id[2] })
  }

  return { hovers, queries }
}

function throwEmptyQuery(run: TwoslashRun, query: number, file: VirtualFile): never {
  const pos = run.indexToPos(query)
  throw new TwoslashError(
    `Invalid quick info query`,
    `The request on line ${pos.line + 2} in ${file.filename} for quickinfo via ^? returned nothing from the compiler.`,
    `This is likely that the positioning is off.`,
  )
}

export function addQuickInfoNodes(run: TwoslashRun, requests: { hovers: HoverRequest[], queries: HoverRequest[] }, getQuickInfo: (request: HoverRequest) => QuickInfo | undefined) {
  for (const request of requests.hovers) {
    const info = getQuickInfo(request)
    if (info)
      run.nodes.push({ type: 'hover', ...info, start: request.start, length: request.target.length, target: request.target })
  }
  for (const request of requests.queries) {
    const info = getQuickInfo(request)
    if (!info)
      throwEmptyQuery(run, request.start, request.file)
    run.nodes.push({ type: 'query', ...info, start: request.start, length: request.target.length, target: request.target })
  }

  if (run.meta.handbookOptions.showEmit)
    return

  for (const highlight of run.meta.positionHighlights) {
    run.nodes.push({
      type: 'highlight',
      start: highlight[0],
      length: highlight[1] - highlight[0],
      text: highlight[2],
    })
  }
}

export function getCompletionRequests(run: TwoslashRun): CompletionRequest[] {
  if (run.meta.handbookOptions.showEmit)
    return []

  return run.meta.positionCompletions.map((target) => {
    const file = getFileAtPosition(run, target)!
    if (run.isInRemoval(target) || !file) {
      throw new TwoslashError(
        `Invalid completion query`,
        `The request on line ${run.indexToPos(target).line + 2} for completions via ^| is in a removal range.`,
        `This is likely that the positioning is off.`,
      )
    }

    const prefix = run.code.slice(0, target).match(/[$\w]+$/)?.[0].split('.').pop() || ''
    // If matched with an identifier prefix
    if (prefix)
      return { file, target, prefix, offset: getOffsetInFile(target, file) - 1 }
    // If not, we try to trigger with character (e.g. `.`, `'`, `"`)
    const triggerCharacter = run.code[target - 1] || ''
    return { file, target, prefix: triggerCharacter, offset: getOffsetInFile(target, file), triggerCharacter }
  })
}

export function addCompletionNodes(run: TwoslashRun, requests: CompletionRequest[], getCompletions: (request: CompletionRequest) => Completion[]) {
  const { code } = run
  for (const request of requests) {
    const { file, target } = request
    let { prefix } = request
    let completions: Completion[] = []

    if (request.triggerCharacter === undefined) {
      completions = getCompletions(request)
      prefix = (completions[0]?.replacementSpan && code.slice(
        completions[0].replacementSpan.start,
        target,
      )) || prefix
      completions = completions.filter(i => i.name.startsWith(prefix))
    }
    else if (prefix) {
      completions = getCompletions(request)
      if (completions[0]?.replacementSpan?.length) {
        prefix = (code.slice(
          completions[0].replacementSpan.start,
          target,
        )) || prefix
        const newCompletions = completions.filter(i => i.name.startsWith(prefix))
        if (newCompletions.length)
          completions = newCompletions
      }
    }

    if (!completions?.length && !run.meta.handbookOptions.noErrorValidation) {
      const pos = run.indexToPos(target)
      throw new TwoslashError(
        `Invalid completion query`,
        `The request on line ${pos.line} in ${file.filename} for completions via ^| returned no completions from the compiler. (prefix: ${prefix})`,
        `This is likely that the positioning is off.`,
      )
    }

    run.nodes.push({
      type: 'completion',
      start: target,
      length: 0,
      completions,
      completionsPrefix: prefix,
    })
  }
}

/**
 * Turn diagnostics into error nodes, apply `filterNode`, and validate the errors are expected
 */
export function addErrorNodes(run: TwoslashRun, getDiagnostics: (file: VirtualFile) => Diagnostic[]) {
  const { meta } = run
  let errorNodes: Omit<NodeError, keyof Position>[] = []

  if (meta.handbookOptions.noErrors !== true) {
    const ignores = Array.isArray(meta.handbookOptions.noErrors)
      ? meta.handbookOptions.noErrors
      : []
    for (const file of meta.virtualFiles) {
      if (!file.supportLsp)
        continue
      for (const diagnostic of getDiagnostics(file)) {
        if (ignores.includes(diagnostic.code))
          continue
        const start = diagnostic.start + file.offset - (file.prepend?.length || 0)
        if (meta.handbookOptions.noErrorsCutted && run.isInRemoval(start))
          continue
        errorNodes.push({
          type: 'error',
          start,
          length: diagnostic.length,
          code: diagnostic.code,
          filename: file.filename,
          id: `err-${diagnostic.code}-${start}-${diagnostic.length}`,
          text: diagnostic.text,
          level: diagnosticCategoryToErrorLevel(diagnostic.category),
        })
      }
    }
  }

  if (run.filterNode) {
    run.nodes = run.nodes.filter(run.filterNode)
    errorNodes = errorNodes.filter(run.filterNode)
  }
  run.nodes.push(...errorNodes)

  // A validator that error codes are mentioned, so we can know if something has broken in the future
  if (!meta.handbookOptions.noErrorValidation && errorNodes.length)
    validateCodeForErrors(errorNodes as NodeError[], meta.handbookOptions, run.fsRoot)
}

export function finalizeRun(run: TwoslashRun, outputCode = run.code): TwoslashReturn {
  const { meta } = run
  let nodes = run.nodes
  if (!meta.handbookOptions.keepNotations) {
    const removed = removeCodeRanges(outputCode, meta.removals, nodes)
    outputCode = removed.code
    nodes = removed.nodes
    meta.removals = removed.removals
  }

  const indexToPos = outputCode === run.code
    ? run.indexToPos
    : createPositionConverter(outputCode).indexToPos

  return {
    code: outputCode,
    nodes: resolveNodePositions(nodes, indexToPos),
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

function diagnosticCategoryToErrorLevel(e: number): ErrorLevel | undefined {
  switch (e) {
    case 0:
      return 'warning'
    case 1:
      return 'error'
    case 2:
      return 'suggestion'
    case 3:
      return 'message'
    default:
      return undefined
  }
}
