import type { SourceFile } from 'typescript'
import { TwoslashError } from './error'
import type { NodeStartLength, NodeWithoutPosition, ParsedFlagNotation, Position, Range, TwoSlashNode, VirtualFile } from './types'
import { defaultHandbookOptions } from './defaults'
import type { CompilerOptionDeclaration } from './types/internal'

export function parsePrimitive(value: string, type: string): any {
  // eslint-disable-next-line valid-typeof
  if (typeof value === type)
    return value
  switch (type) {
    case 'number':
      return +value
    case 'string':
      return value
    case 'boolean':
      return value.toLowerCase() === 'true' || value.length === 0
  }

  throw new TwoslashError(
    `Unknown primitive value in compiler flag`,
    `The only recognized primitives are number, string and boolean. Got ${type} with ${value}.`,
    `This is likely a typo.`,
  )
}

export function typesToExtension(types: string) {
  const map: Record<string, string> = {
    js: 'js',
    javascript: 'js',
    ts: 'ts',
    typescript: 'ts',
    tsx: 'tsx',
    jsx: 'jsx',
    json: 'json',
    jsn: 'json',
  }

  if (map[types])
    return map[types]

  throw new TwoslashError(
    `Unknown TypeScript extension given to Twoslash`,
    `Received ${types} but Twoslash only accepts: ${Object.keys(map)} `,
    ``,
  )
}

export function getIdentifierTextSpans(ts: typeof import('typescript'), sourceFile: SourceFile, fileOffset: number) {
  const textSpans: [start: number, end: number, text: string][] = []
  checkChildren(sourceFile)
  return textSpans

  function checkChildren(node: import('typescript').Node) {
    ts.forEachChild(node, (child) => {
      if (ts.isIdentifier(child)) {
        const text = child.getText(sourceFile)
        const start = child.getStart(sourceFile, false) + fileOffset
        const end = start + text.length
        textSpans.push([start, end, text])
      }

      checkChildren(child)
    })
  }
}

export function isInRange(index: number, range: Range) {
  return range[0] <= index && index <= range[1]
}

export function isInRanges(index: number, ranges: Range[]) {
  return ranges.find(range => isInRange(index, range))
}

export function areRangesIntersecting(a: Range, b: Range) {
  return isInRange(a[0], b) || isInRange(a[1], b) || isInRange(b[0], a) || isInRange(b[1], a)
}

/**
 * Merge overlapping ranges
 */
export function mergeRanges(ranges: Range[]) {
  ranges.sort((a, b) => a[0] - b[0])
  const merged: Range[] = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && last[1] >= range[0])
      last[1] = Math.max(last[1], range[1])
    else
      merged.push(range)
  }
  return merged
}

export function getOptionValueFromMap(name: string, key: string, optMap: Map<string, string>) {
  const result = optMap.get(key.toLowerCase())
  if (result === undefined) {
    const keys = Array.from(optMap.keys() as any)

    throw new TwoslashError(
      `Invalid inline compiler value`,
      `Got ${key} for ${name} but it is not a supported value by the TS compiler.`,
      `Allowed values: ${keys.join(',')}`,
    )
  }
  return result
}

/**
 * Creates a converter between index and position in a code block.
 */
export function createPositionConverter(code: string) {
  const lines = Array.from(code.matchAll(/.*?($|\n)/g)).map(match => match[0])

  function indexToPos(index: number): Position {
    let character = index
    let line = 0
    for (const lineText of lines) {
      if (character < lineText.length)
        break
      character -= lineText.length
      line++
    }
    return { line, character }
  }

  function posToIndex(line: number, character: number) {
    let index = 0
    for (let i = 0; i < line - 1; i++)
      index += lines[i].length

    index += character
    return index
  }

  function getIndexOfLineAbove(index: number): number {
    const pos = indexToPos(index)
    return posToIndex(pos.line, pos.character)
  }

  return {
    lines,
    indexToPos,
    posToIndex,
    getIndexOfLineAbove,
  }
}

const reFilenamesMakers = /^\/\/\s?@filename: (.+)$/mg

export function splitFiles(code: string, defaultFileName: string, root: string) {
  const matches = Array.from(code.matchAll(reFilenamesMakers))

  let currentFileName = defaultFileName
  const files: VirtualFile[] = []

  let index = 0
  for (const match of matches) {
    const offset = match.index!
    const content = code.slice(index, offset)
    if (content) {
      files.push({
        offset: index,
        filename: currentFileName,
        filepath: root + currentFileName,
        content,
        extension: getExtension(currentFileName),
      })
    }
    currentFileName = match[1].trimEnd()
    index = offset
  }

  if (index < code.length) {
    const content = code.slice(index)
    files.push({
      offset: index,
      filename: currentFileName,
      filepath: root + currentFileName,
      content,
      extension: getExtension(currentFileName),
    })
  }

  return files
}

export function getExtension(fileName: string) {
  return fileName.split('.').pop()!
}

/**
 * Remove ranages for a string, and update nodes' `start` property accordingly
 *
 * Note that items in `nodes` will be mutated
 */
export function removeCodeRanges<T extends NodeStartLength>(code: string, removals: Range[], nodes: T[]): { code: string, removals: Range[], nodes: T[] }
export function removeCodeRanges(code: string, removals: Range[]): { code: string, removals: Range[], nodes: undefined }
export function removeCodeRanges(code: string, removals: Range[], nodes?: NodeStartLength[]) {
  // Sort descending, so that we start removal from the end
  const ranges = mergeRanges(removals)
    .sort((a, b) => b[0] - a[0])

  let outputCode = code
  for (const remove of ranges) {
    const removalLength = remove[1] - remove[0]
    outputCode = outputCode.slice(0, remove[0]) + outputCode.slice(remove[1])
    nodes?.forEach((node) => {
      // nodes before the range, do nothing
      if (node.start + node.length <= remove[0])
        return undefined

      // remove nodes that are within in the range
      else if (node.start < remove[1])
        node.start = -1

      // move nodes after the range forward
      else
        node.start -= removalLength
    })
  }

  return {
    code: outputCode,
    removals: ranges,
    nodes,
  }
}

/**
 * - Calculate nodes `line` and `character` properties to match the code
 * - Remove nodes that has negative `start` property
 * - Sort nodes by `start`
 *
 * Note that the nodes items will be mutated, clone them beforehand if not desired
 */
export function resolveNodePositions(nodes: NodeWithoutPosition[], code: string): TwoSlashNode[]
export function resolveNodePositions(nodes: NodeWithoutPosition[], indexToPos: (index: number) => Position): TwoSlashNode[]
export function resolveNodePositions(nodes: NodeWithoutPosition[], options: string | ((index: number) => Position)): TwoSlashNode[] {
  const indexToPos = typeof options === 'string'
    ? createPositionConverter(options).indexToPos
    : options

  const resolved = nodes
    .filter(node => node.start >= 0)
    .sort((a, b) => a.start - b.start) as TwoSlashNode[]

  resolved
    .forEach(node => Object.assign(node, indexToPos(node.start)))

  return resolved
}

export function parseFlag(
  name: string,
  value: any,
  start: number,
  end: number,
  customTags: string[],
  tsOptionDeclarations: CompilerOptionDeclaration[],
): ParsedFlagNotation {
  if (customTags.includes(name)) {
    return {
      type: 'tag',
      name,
      value,
      start,
      end,
    }
  }

  const compilerDecl = tsOptionDeclarations.find(d => d.name.toLocaleLowerCase() === name.toLocaleLowerCase())
  // if it's compilerOptions
  if (compilerDecl) {
    switch (compilerDecl.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return {
          type: 'compilerOptions',
          name: compilerDecl.name,
          value: parsePrimitive(value, compilerDecl.type),
          start,
          end,
        }
      case 'list': {
        const elementType = compilerDecl.element!.type
        const strings = value.split(',') as string[]
        const resolved = typeof elementType === 'string'
          ? strings.map(v => parsePrimitive(v, elementType))
          : strings.map(v => getOptionValueFromMap(compilerDecl.name, v, elementType as Map<string, string>))
        return {
          type: 'compilerOptions',
          name: compilerDecl.name,
          value: resolved,
          start,
          end,
        }
      }
      default: {
        // It's a map
        return {
          type: 'compilerOptions',
          name: compilerDecl.name,
          value: getOptionValueFromMap(compilerDecl.name, value, compilerDecl.type),
          start,
          end,
        }
      }
    }
  }

  // if it's handbookOptions
  if (Object.keys(defaultHandbookOptions).includes(name)) {
    // "errors" is a special case, it's a list of numbers
    if (name === 'errors' && typeof value === 'string')
      value = value.split(' ').map(Number)

    return {
      type: 'handbookOptions',
      name,
      value,
      start,
      end,
    }
  }

  // unknown compiler flag
  return {
    type: 'unknown',
    name,
    value,
    start,
    end,
  }
}
