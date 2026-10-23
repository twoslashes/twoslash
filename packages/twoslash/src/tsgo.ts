import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { API, Diagnostic as TsgoDiagnostic } from 'typescript7/unstable/async'
import type { Completion, Diagnostic, IdentifierSpan, QuickInfo } from './pipeline'
import type { VirtualFile } from './types'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { createPositionConverter } from 'twoslash-protocol'
import { TwoslashError } from './error'
import { getIdentifierTextSpans } from './utils'

interface LspMessage {
  id?: number
  method?: string
  params?: { items?: unknown[] }
  result?: unknown
  error?: { message: string }
}

interface Hover {
  contents: { kind: string, value: string }
}

interface LspRange {
  start: { line: number, character: number }
  end: { line: number, character: number }
}

interface CompletionList {
  items: {
    label: string
    kind?: number
    tags?: number[]
    sortText?: string
    textEdit?: { range: LspRange } | { insert: LspRange, replace: LspRange }
  }[]
}

interface FileContent {
  filepath: string
  content: string
}

/**
 * A JSON-RPC connection to `tsc --lsp --stdio`
 */
function createLspConnection(executable: string, cwd: string) {
  const child: ChildProcessWithoutNullStreams = spawn(executable, ['--lsp', '--stdio'], { cwd })
  const pending = new Map<number, { resolve: (result: unknown) => void, reject: (error: Error) => void }>()
  let lastId = 0
  let buffer = Buffer.alloc(0)

  function send(message: object) {
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }))
    child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`)
    child.stdin.write(body)
  }

  function handle(message: LspMessage) {
    if (message.method) {
      // Requests from the server (configuration, capability registration, progress) only need an answer
      if (message.id !== undefined)
        send({ id: message.id, result: message.method === 'workspace/configuration' ? message.params?.items?.map(() => null) : null })
      return
    }
    const request = pending.get(message.id!)
    pending.delete(message.id!)
    if (message.error)
      request?.reject(new Error(message.error.message))
    else
      request?.resolve(message.result)
  }

  child.stdout.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1)
        return
      const length = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, headerEnd).toString())![1])
      const bodyStart = headerEnd + 4
      if (buffer.length < bodyStart + length)
        return
      const body = buffer.subarray(bodyStart, bodyStart + length).toString()
      buffer = buffer.subarray(bodyStart + length)
      handle(JSON.parse(body))
    }
  })

  function rejectPending(error: Error) {
    for (const request of pending.values())
      request.reject(error)
    pending.clear()
  }
  child.on('error', rejectPending)
  child.on('exit', code => rejectPending(new Error(`TypeScript language server exited with code ${code}`)))

  return {
    request<T>(method: string, params: object): Promise<T> {
      const id = ++lastId
      return new Promise<T>((resolve, reject) => {
        // The server's response shape is defined by the LSP spec for each method
        pending.set(id, { resolve: resolve as (result: unknown) => void, reject })
        send({ id, method, params })
      })
    },
    notify(method: string, params: object) {
      send({ method, params })
    },
    kill() {
      child.kill()
    },
  }
}

const languageIds: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  jsx: 'javascriptreact',
  json: 'json',
}

// Maps LSP `CompletionItemKind` back to TypeScript's `ScriptElementKind`, which renderers expect.
// The language server folds several kinds together, so this picks the most common one.
const completionKinds: Record<number, string> = {
  2: 'method',
  3: 'function',
  4: 'constructor',
  5: 'property',
  6: 'var',
  7: 'class',
  8: 'interface',
  9: 'module',
  10: 'property',
  13: 'enum',
  14: 'keyword',
  17: 'script',
  19: 'directory',
  20: 'enum member',
  21: 'string',
  25: 'type parameter',
}

function flattenDiagnosticText(diagnostic: TsgoDiagnostic, indent = 0): string {
  const prefix = indent ? `\n${'  '.repeat(indent)}` : ''
  return prefix + diagnostic.text + (diagnostic.messageChain ?? []).map(i => flattenDiagnosticText(i, indent + 1)).join('')
}

function parseHover(hover: Hover | null): QuickInfo | undefined {
  const match = hover && /^```\w*\n([\s\S]*?)\n```\n?([\s\S]*)$/.exec(hover.contents.value)
  if (!match)
    return
  // Tags are rendered as `*@name* text` paragraphs after the documentation
  const [docs, ...tags] = `\n\n${match[2]}`.split(/\n\n(?=\*@)/)
  return {
    text: match[1],
    docs: docs.trim() || undefined,
    tags: tags.length
      ? tags.map((tag): [string, string | undefined] => {
          const [, name, text] = /^\*@([^*\s]+)\*(?: — | )?([\s\S]*)$/.exec(tag)!
          return [name, text.replace(/^`(\S+)`(?: — |$)/, '$1 ').trimEnd() || undefined]
        })
      : undefined,
  }
}

/**
 * A long-lived TypeScript 7 language server. Hovers and completions come from LSP, syntax trees and
 * diagnostics from the API session attached to the same server, so both see the same files.
 */
export async function createTsgoSession(packageDirectory: string, root: string) {
  const packageRequire = createRequire(join(packageDirectory, 'package.json'))
  const importFromPackage = (path: string) => import(pathToFileURL(path).href)
  const [{ default: getExePath }, { API }, { SyntaxKind }] = await Promise.all([
    importFromPackage(join(packageDirectory, 'lib/getExePath.js')),
    importFromPackage(packageRequire.resolve('typescript/unstable/async')),
    importFromPackage(packageRequire.resolve('typescript/unstable/ast')),
  ])

  const lsp = createLspConnection(getExePath(), root)
  const toUri = (filepath: string) => pathToFileURL(filepath).href
  await lsp.request('initialize', {
    processId: process.pid,
    rootUri: toUri(root),
    capabilities: {
      textDocument: {
        hover: { contentFormat: ['markdown'] },
        completion: { completionItem: { tagSupport: { valueSet: [1] } } },
      },
    },
  })
  lsp.notify('initialized', {})
  const api: API<true> = await API.fromLSPConnection(await lsp.request('custom/initializeAPISession', {}))

  const openDocument = (filepath: string, text: string, version = 1) => lsp.notify('textDocument/didOpen', {
    textDocument: { uri: toUri(filepath), languageId: languageIds[filepath.split('.').pop()!] ?? 'typescript', version, text },
  })
  let tsconfigVersion = 0

  /**
   * Open the files together with a tsconfig describing them, the returned project is valid until `close` is called
   */
  async function openProject(tsconfigPath: string, tsconfig: string, files: FileContent[]) {
    const missingDirectory = files.map(i => dirname(i.filepath)).find(i => !existsSync(i))
    if (missingDirectory) {
      throw new TwoslashError(
        `Directory '${missingDirectory}' does not exist`,
        'The TypeScript 7 language server only resolves virtual files in directories that exist on disk',
        'Create the directory, or move the file to an existing one',
      )
    }

    // The tsconfig stays open between runs to keep the project, and its parsed libraries, alive
    if (tsconfigVersion++)
      lsp.notify('textDocument/didChange', { textDocument: { uri: toUri(tsconfigPath), version: tsconfigVersion }, contentChanges: [{ text: tsconfig }] })
    else
      openDocument(tsconfigPath, tsconfig)
    for (const { filepath, content } of files)
      openDocument(filepath, content)

    // The API session is a separate channel, a request makes sure the server has processed the opened files first
    await lsp.request('textDocument/documentSymbol', { textDocument: { uri: toUri(files.at(-1)?.filepath ?? tsconfigPath) } })
    // The API client caches source files by snapshot, unaware of files changed through LSP
    api.clearSourceFileCache()
    const snapshot = await api.updateSnapshot()
    const project = snapshot.getProject(tsconfigPath)!
    const { program } = project
    const contents = new Map(files.map(i => [i.filepath, i.content]))

    return {
      async getConfigErrors() {
        const diagnostics = [
          ...await program.getConfigFileParsingDiagnostics(),
          ...await program.getProgramDiagnostics(),
        ]
        // Compiler option diagnostics use the 5xxx and 6xxx codes, others (e.g. missing `types`) are left to the program
        return diagnostics.filter(i => i.code >= 5000 && i.code < 7000).map(i => flattenDiagnosticText(i))
      },

      async getIdentifiers(file: VirtualFile): Promise<IdentifierSpan[]> {
        const sourceFile = await program.getSourceFile(file.filepath)
        return sourceFile ? getIdentifierTextSpans(sourceFile, SyntaxKind.Identifier, file.offset - (file.prepend?.length || 0)) : []
      },

      async getQuickInfo(filepath: string, offset: number) {
        const position = createPositionConverter(contents.get(filepath)!).indexToPos(offset)
        return parseHover(await lsp.request<Hover | null>('textDocument/hover', { textDocument: { uri: toUri(filepath) }, position }))
      },

      async getCompletions(filepath: string, offset: number, triggerCharacter?: string): Promise<Completion[]> {
        const pc = createPositionConverter(contents.get(filepath)!)
        const context = triggerCharacter === undefined ? { triggerKind: 1 } : { triggerKind: 2, triggerCharacter }
        const result = await lsp.request<CompletionList | null>('textDocument/completion', { textDocument: { uri: toUri(filepath) }, position: pc.indexToPos(offset), context })
        return (result?.items ?? []).map((item) => {
          const range = item.textEdit && ('range' in item.textEdit ? item.textEdit.range : item.textEdit.replace)
          const start = range && pc.posToIndex(range.start.line, range.start.character)
          return {
            name: item.label,
            kind: completionKinds[item.kind ?? 0],
            kindModifiers: item.tags?.includes(1) ? 'deprecated' : undefined,
            sortText: item.sortText,
            replacementSpan: range && { start: start!, length: pc.posToIndex(range.end.line, range.end.character) - start! },
          }
        })
      },

      async getDiagnostics(filepath: string): Promise<Diagnostic[]> {
        const diagnostics = [
          ...await program.getSemanticDiagnostics(filepath),
          ...await program.getSyntacticDiagnostics(filepath),
        ]
        return diagnostics.map(i => ({ start: i.pos, length: i.end - i.pos, code: i.code, category: i.category, text: flattenDiagnosticText(i) }))
      },

      async close() {
        await snapshot.dispose()
        for (const { filepath } of files)
          lsp.notify('textDocument/didClose', { textDocument: { uri: toUri(filepath) } })
      },
    }
  }

  return {
    openProject,
    async close() {
      await api.close()
      lsp.kill()
    },
  }
}

export function resolveTsPackageDirectory() {
  return dirname(createRequire(import.meta.url).resolve('typescript/package.json'))
}
