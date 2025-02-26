import type { createPositionConverter, Range } from 'twoslash-protocol'
import type { SourceFile } from 'typescript'
import type { CompilerOptionDeclaration, ParsedFlagNotation, TwoslashReturnMeta, VirtualFile } from './types'
import { hash as objectHash } from 'ohash'
import { defaultHandbookOptions } from './defaults'
import { TwoslashError } from './error'
import { reAnnonateMarkers, reConfigBoolean, reConfigValue, reCutAfter, reCutBefore, reCutEnd, reCutStart, reFilenamesMakers } from './regexp'

export function getObjectHash(obj: any): string {
  return objectHash(obj)
}

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
    map: 'json',
    mts: 'ts',
    cts: 'ts',
    mjs: 'js',
    cjs: 'js',
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

export function splitFiles(code: string, defaultFileName: string, root: string) {
  const matches = Array.from(code.matchAll(reFilenamesMakers))
  const allFilenames = matches.map(match => match[1].trimEnd())
  let currentFileName = allFilenames.includes(defaultFileName)
    ? '__index__.ts'
    : defaultFileName
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
      case 'object':
        return {
          type: 'compilerOptions',
          name: compilerDecl.name,
          value: JSON.parse(value),
          start,
          end,
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
    // "errors" is a list of numbers
    if (name === 'errors' && typeof value === 'string')
      value = value.split(' ').map(Number)

    // "noErrors" can be a boolean or a list of numbers
    if (name === 'noErrors' && typeof value === 'string') {
      if (value === 'true')
        value = true
      else if (value === 'false')
        value = false
      else
        value = value.split(' ').map(Number)
    }

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

export function findFlagNotations(code: string, customTags: string[], tsOptionDeclarations: CompilerOptionDeclaration[]) {
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

export function findCutNotations(code: string, meta: Pick<TwoslashReturnMeta, 'removals'>) {
  const removals: Range[] = []

  const cutBefore = [...code.matchAll(reCutBefore)]
  const cutAfter = [...code.matchAll(reCutAfter)]
  const cutStart = [...code.matchAll(reCutStart)]
  const cutEnd = [...code.matchAll(reCutEnd)]

  if (cutBefore.length) {
    const last = cutBefore[cutBefore.length - 1]
    removals.push([0, last.index! + last[0].length])
  }
  if (cutAfter.length) {
    const first = cutAfter[0]
    removals.push([first.index!, code.length])
  }
  if (cutStart.length !== cutEnd.length) {
    throw new TwoslashError(
      `Mismatched cut markers`,
      `You have ${cutStart.length} cut-starts and ${cutEnd.length} cut-ends`,
      `Make sure you have a matching pair for each.`,
    )
  }
  for (let i = 0; i < cutStart.length; i++) {
    const start = cutStart[i]
    const end = cutEnd[i]
    if (start.index! > end.index!) {
      throw new TwoslashError(
        `Mismatched cut markers`,
        `You have a cut-start at ${start.index} which is after the cut-end at ${end.index}`,
        `Make sure you have a matching pair for each.`,
      )
    }
    removals.push([start.index!, end.index! + end[0].length])
  }

  if (meta)
    meta.removals.push(...removals)

  return removals
}

export function findQueryMarkers(
  code: string,
  meta: Pick<TwoslashReturnMeta, 'positionQueries' | 'positionCompletions' | 'positionHighlights' | 'removals'>,
  pc: ReturnType<typeof createPositionConverter>,
) {
  if (code.includes('//')) {
    const linesQuery = new Set<number>()
    Array.from(code.matchAll(reAnnonateMarkers)).forEach((match) => {
      const type = match[1] as '?' | '|' | '^^'
      const index = match.index!
      meta.removals.push([index, index + match[0].length + 1])
      const markerIndex = match[0].indexOf('^')

      const pos = pc.indexToPos(index + markerIndex)
      let targetLine = pos.line - 1
      while (linesQuery.has(targetLine) && targetLine >= 0)
        targetLine -= 1

      const targetIndex = pc.posToIndex(targetLine, pos.character)
      if (type === '?') {
        meta.positionQueries.push(targetIndex)
      }
      else if (type === '|') {
        meta.positionCompletions.push(targetIndex)
      }
      else {
        const markerLength = match[0].lastIndexOf('^') - markerIndex + 1
        meta.positionHighlights.push([
          targetIndex,
          targetIndex + markerLength,
          match[2]?.trim(),
        ])
      }
      linesQuery.add(pos.line)
    })
  }
  return meta
}

/** De-extension a filename, used for going from an output file to the source */
export function removeTsExtension(filename: string) {
  // originally, .replace(".jsx", "").replace(".js", "").replace(".d.ts", "").replace(".map", "")
  const sansMapOrDTS = filename
    .replace(/\.map$/, '')
    .replace(/\.d\.ts$/, '.ts')
    .replace(/\.map$/, '')
  return sansMapOrDTS.replace(/\.[^/.]+$/, '')
}
