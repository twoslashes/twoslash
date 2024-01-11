import type { SourceFile } from 'typescript'
import { TwoslashError } from './error'
import type { Position, Range, TemporaryFile } from './types'

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

export function getIdentifierTextSpans(ts: typeof import('typescript'), sourceFile: SourceFile) {
  const textSpans: [start: number, text: string][] = []
  checkChildren(sourceFile)
  return textSpans

  function checkChildren(node: import('typescript').Node) {
    ts.forEachChild(node, (child) => {
      if (ts.isIdentifier(child))
        textSpans.push([child.getStart(sourceFile, false), child.getText(sourceFile)])

      checkChildren(child)
    })
  }
}

export function isInRanges(index: number, ranges: Range[]) {
  return ranges.find(([start, end]) => start <= index && index <= end)
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

export function splitFiles(code: string, defaultFileName: string, rootPath: string) {
  const matches = Array.from(code.matchAll(reFilenamesMakers))

  let currentFileName = rootPath + defaultFileName
  const files: TemporaryFile[] = []

  let index = 0
  for (const match of matches) {
    const offset = match.index!
    const content = code.slice(index, offset)
    if (content) {
      files.push({
        offset: index,
        filename: currentFileName,
        content,
        extension: getExtension(currentFileName),
      })
    }
    currentFileName = rootPath + match[1].trimEnd()
    index = offset
  }

  if (index < code.length) {
    const content = code.slice(index)
    files.push({
      offset: index,
      filename: currentFileName,
      content,
      extension: getExtension(currentFileName),
    })
  }

  return files
}

export function getExtension(fileName: string) {
  return fileName.split('.').pop()!
}
