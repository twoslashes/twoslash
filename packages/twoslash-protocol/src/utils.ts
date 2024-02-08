import type { NodeStartLength, NodeWithoutPosition, Position, Range, TwoslashNode } from './types'

export function isInRange(index: number, range: Range) {
  return range[0] <= index && index <= range[1]
}

export function isInRanges(index: number, ranges: Range[]) {
  return ranges.find(range => isInRange(index, range))
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

/**
 * Slipt a string into lines, each line preserves the line ending.
 */
export function splitLines(code: string, preserveEnding = false): [string, number][] {
  const parts = code.split(/(\r?\n)/g)
  let index = 0
  const lines: [string, number][] = []
  for (let i = 0; i < parts.length; i += 2) {
    const line = preserveEnding
      ? parts[i] + (parts[i + 1] || '')
      : parts[i]
    lines.push([line, index])
    index += parts[i].length
    index += parts[i + 1]?.length || 0
  }
  return lines
}

/**
 * Creates a converter between index and position in a code block.
 */
export function createPositionConverter(code: string) {
  const lines = splitLines(code, true).map(([line]) => line)

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
    for (let i = 0; i < line; i++)
      index += lines[i].length

    index += character
    return index
  }

  return {
    lines,
    indexToPos,
    posToIndex,
  }
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
export function resolveNodePositions(nodes: NodeWithoutPosition[], code: string): TwoslashNode[]
export function resolveNodePositions(nodes: NodeWithoutPosition[], indexToPos: (index: number) => Position): TwoslashNode[]
export function resolveNodePositions(nodes: NodeWithoutPosition[], options: string | ((index: number) => Position)): TwoslashNode[] {
  const indexToPos = typeof options === 'string'
    ? createPositionConverter(options).indexToPos
    : options

  const resolved = nodes
    .filter(node => node.start >= 0)
    .sort((a, b) => a.start - b.start || a.type.localeCompare(b.type)) as TwoslashNode[]

  resolved
    .forEach(node => Object.assign(node, indexToPos(node.start)))

  return resolved
}
