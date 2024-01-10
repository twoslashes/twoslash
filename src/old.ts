/* eslint-disable no-case-declarations */
import { createFSBackedSystem, createSystem, createVirtualTypeScriptEnvironment } from "@typescript/vfs"
import type { CompilerOptions, ScriptTarget } from "typescript"
import type { HandbookOptions, HighlightPosition, PartialCompletionResults, PartialQueryResults , QueryPosition, TwoSlashOptions, TwoSlashReturn } from "./types"
import { TwoslashError } from "./error"
import { cleanMarkdownEscaped, getClosestWord, getIdentifierTextSpans, parsePrimitive, typesToExtension } from "./utils"
import { validateCodeForErrors, validateInput } from "./validation"

export * from './error'
export * from './types'

type TS = typeof import("typescript")

// eslint-disable-next-line no-console
const log = false ? console.log : undefined

function filterHighlightLines(codeLines: string[]): { highlights: HighlightPosition[]; queries: QueryPosition[] } {
  const highlights: HighlightPosition[] = []
  const queries: QueryPosition[] = []

  let nextContentOffset = 0
  let contentOffset = 0
  let removedLines = 0

  for (let i = 0; i < codeLines.length; i++) {
    const line = codeLines[i]
    const moveForward = () => {
      contentOffset = nextContentOffset
      nextContentOffset += line.length + 1
    }

    const stripLine = (logDesc: string) => {
      log?.(`Removing line ${i} for ${logDesc}`)

      removedLines++
      codeLines.splice(i, 1)
      i--
    }

    // We only need to run regexes over lines with comments
    if (!line.includes("//")) {
      moveForward()
    } else {
      const highlightMatch = /^\s*\/\/\s*\^+( .+)?$/.exec(line)
      const queryMatch = /^\s*\/\/\s*\^\?\s*$/.exec(line)
      // https://regex101.com/r/2yDsRk/1
      const removePrettierIgnoreMatch = /^\s*\/\/ prettier-ignore$/.exec(line)
      const completionsQuery = /^\s*\/\/\s*\^\|$/.exec(line)

      if (queryMatch !== null) {
        const start = line.indexOf("^")
        queries.push({ kind: "query", offset: start, text: undefined, docs: undefined, line: i + removedLines - 1 })
        stripLine("having a query")
      } else if (highlightMatch !== null) {
        const start = line.indexOf("^")
        const length = line.lastIndexOf("^") - start + 1
        const description = highlightMatch[1] ? highlightMatch[1].trim() : ""
        highlights.push({
          kind: "highlight",
          offset: start + contentOffset,
          length,
          text: description,
          line: i + removedLines - 1,
          start,
        })

        stripLine("having a highlight")
      } else if (removePrettierIgnoreMatch !== null) {
        stripLine("being a prettier ignore")
      } else if (completionsQuery !== null) {
        const start = line.indexOf("^")
        // prettier-ignore
        queries.push({ kind: "completion", offset: start, text: undefined, docs: undefined, line: i + removedLines - 1 })
        stripLine("having a completion query")
      } else {
        moveForward()
      }
    }
  }
  return { highlights, queries }
}

function getOptionValueFromMap(name: string, key: string, optMap: Map<string, string>) {
  const result = optMap.get(key.toLowerCase())
  log?.(`Get ${name} mapped option: ${key} => ${result}`)
  if (result === undefined) {
    const keys = Array.from(optMap.keys() as any)

    throw new TwoslashError(
      `Invalid inline compiler value`,
      `Got ${key} for ${name} but it is not a supported value by the TS compiler.`,
      `Allowed values: ${keys.join(",")}`
    )
  }
  return result
}

function setOption(name: string, value: string, opts: CompilerOptions, ts: TS) {
  log?.(`Setting ${name} to ${value}`)

  for (const opt of ts.optionDeclarations) {
    if (opt.name.toLowerCase() === name.toLowerCase()) {
      switch (opt.type) {
        case "number":
        case "string":
        case "boolean":
          opts[opt.name] = parsePrimitive(value, opt.type)
          break

        case "list":
          const elementType = opt.element!.type
          const strings = value.split(",")
          if (typeof elementType === "string") {
            opts[opt.name] = strings.map(v => parsePrimitive(v, elementType))
          } else {
            opts[opt.name] = strings.map(v => getOptionValueFromMap(opt.name, v, elementType as Map<string, string>))
          }
          break

        default:
          // It's a map!
          const optMap = opt.type as Map<string, string>
          opts[opt.name] = getOptionValueFromMap(opt.name, value, optMap)
          break
      }
      return
    }
  }

  throw new TwoslashError(
    `Invalid inline compiler flag`,
    `There isn't a TypeScript compiler flag called '${name}'.`,
    `This is likely a typo, you can check all the compiler flags in the TSConfig reference, or check the additional Twoslash flags in the npm page for twoslashes.`
  )
}

const booleanConfigRegexp = /^\/\/\s?@(\w+)$/

// https://regex101.com/r/8B2Wwh/1
const valuedConfigRegexp = /^\/\/\s?@(\w+):\s?(.+)$/

function filterCompilerOptions(codeLines: string[], defaultCompilerOptions: CompilerOptions, ts: TS) {
  const options = { ...defaultCompilerOptions }
  for (let i = 0; i < codeLines.length;) {
    let match
    // eslint-disable-next-line no-cond-assign
    if ((match = booleanConfigRegexp.exec(codeLines[i]))) {
      options[match[1]] = true
      setOption(match[1], "true", options, ts)
      // eslint-disable-next-line no-cond-assign
    } else if ((match = valuedConfigRegexp.exec(codeLines[i]))) {
      // Skip a filename tag, which should propagate through this stage
      if (match[1] === "filename") {
        i++
        continue
      }
      setOption(match[1], match[2], options, ts)
    } else {
      i++
      continue
    }
    codeLines.splice(i, 1)
  }
  return options
}

function filterCustomTags(codeLines: string[], customTags: string[]) {
  const tags: TwoSlashReturn["tags"] = []

  for (let i = 0; i < codeLines.length;) {
    let match
    // eslint-disable-next-line no-cond-assign
    if ((match = valuedConfigRegexp.exec(codeLines[i]))) {
      if (customTags.includes(match[1])) {
        tags.push({ name: match[1], line: i, annotation: codeLines[i].split(`@${match[1]}: `)[1] })
        codeLines.splice(i, 1)
      }
    }
    i++
  }
  return tags
}


// Keys in this object are used to filter out handbook options
// before compiler options are set.

export const defaultHandbookOptions: HandbookOptions = {
  errors: [],
  noErrors: false,
  showEmit: false,
  showEmittedFile: undefined,
  noStaticSemanticInfo: false,
  emit: false,
  noErrorValidation: false,
}

function filterHandbookOptions(codeLines: string[]): HandbookOptions {
  const options: any = { ...defaultHandbookOptions }
  for (let i = 0; i < codeLines.length; i++) {
    let match
    // eslint-disable-next-line no-cond-assign
    if ((match = booleanConfigRegexp.exec(codeLines[i]))) {
      if (match[1] in options) {
        options[match[1]] = true
        log?.(`Setting options.${match[1]} to true`)
        codeLines.splice(i, 1)
        i--
      }
      // eslint-disable-next-line no-cond-assign
    } else if ((match = valuedConfigRegexp.exec(codeLines[i]))) {
      if (match[1] in options) {
        options[match[1]] = match[2]
        log?.(`Setting options.${match[1]} to ${match[2]}`)
        codeLines.splice(i, 1)
        i--
      }
    }
  }

  // Edge case the errors object to turn it into a string array
  if ("errors" in options && typeof options.errors === "string") {
    options.errors = options.errors.split(" ").map(Number)
    log?.("Setting options.error to ", options.errors)
  }

  return options
}


/**
 * Runs the checker against a TypeScript/JavaScript code sample returning potentially
 * difference code, and a set of annotations around how it works.
 *
 * @param code The twoslash markup'd code
 * @param extension For example: "ts", "tsx", "typescript", "javascript" or "js".
 * @param options Additional options for twoslash
 */
export function twoslasher(code: string, extension: string, options: TwoSlashOptions = {}): TwoSlashReturn {
  const ts: TS = options.tsModule!

  const originalCode = code
  const safeExtension = typesToExtension(extension)
  const defaultFileName = `index.${safeExtension}`

  log?.(`\n\nLooking at code: \n\`\`\`${safeExtension}\n${code}\n\`\`\`\n`)

  const defaultCompilerOptions = {
    strict: true,
    target: 99 satisfies ScriptTarget.ESNext,
    allowJs: true,
    ...(options.defaultCompilerOptions ?? {}),
  }

  validateInput(code)

  code = cleanMarkdownEscaped(code)

  // NOTE: codeLines is mutated by the below functions:
  const codeLines = code.split(/\r\n?|\n/g)

  let tags: TwoSlashReturn["tags"] = options.customTags ? filterCustomTags(codeLines, options.customTags) : []
  const handbookOptions = { ...filterHandbookOptions(codeLines), ...options.defaultOptions }
  const compilerOptions = filterCompilerOptions(codeLines, defaultCompilerOptions, ts)

  // Handle special casing the lookup for when using jsx preserve which creates .jsx files
  if (!handbookOptions.showEmittedFile) {
    handbookOptions.showEmittedFile =
      compilerOptions.jsx && compilerOptions.jsx === ts.JsxEmit.Preserve ? "index.jsx" : "index.js"
  }

  const getRoot = () => options.vfsRoot!.replace(/\//g, "/") // Normalize slashes

  // In a browser we want to DI everything, in node we can use local infra
  const useFS = !!options.fsMap
  const vfs = useFS && options.fsMap ? options.fsMap : new Map<string, string>()
  const system = useFS ? createSystem(vfs) : createFSBackedSystem(vfs, getRoot(), ts, options.tsLibDirectory)
  const fsRoot = useFS ? "/" : `${getRoot()}/`

  const env = createVirtualTypeScriptEnvironment(system, [], ts, compilerOptions, options.customTransformers)
  const ls = env.languageService

  code = codeLines.join("\n")

  let partialQueries = [] as (PartialQueryResults | PartialCompletionResults)[]
  let queries = [] as TwoSlashReturn["queries"]
  let highlights = [] as TwoSlashReturn["highlights"]

  const nameContent = splitTwoslashCodeInfoFiles(code, defaultFileName, fsRoot)
  const sourceFiles = ["js", "jsx", "ts", "tsx"]

  /** All of the referenced files in the markup */
  const filenames = nameContent.map(nc => nc[0])

  for (const file of nameContent) {
    const [filename, codeLines] = file
    const filetype = filename.split(".").pop() || ""

    // Only run the LSP-y things on source files
    const allowJSON = compilerOptions.resolveJsonModule && filetype === "json"
    if (!sourceFiles.includes(filetype) && !allowJSON) {
      continue
    }

    // Create the file in the vfs
    const newFileCode = codeLines.join("\n")
    env.createFile(filename, newFileCode)

    const updates = filterHighlightLines(codeLines)
    highlights = highlights.concat(updates.highlights)

    // ------ Do the LSP lookup for the queries

    const lspedQueries = updates.queries.map((q, i) => {
      const sourceFile = env.getSourceFile(filename)!
      const position = ts.getPositionOfLineAndCharacter(sourceFile, q.line, q.offset)
      switch (q.kind) {
        case "query": {
          const quickInfo = ls.getQuickInfoAtPosition(filename, position)

          // prettier-ignore
          let text: string
          let docs: string | undefined

          if (quickInfo && quickInfo.displayParts) {
            text = quickInfo.displayParts.map(dp => dp.text).join("")
            docs = quickInfo.documentation ? quickInfo.documentation.map(d => d.text).join("<br/>") : undefined
          } else {
            throw new TwoslashError(
              `Invalid QuickInfo query`,
              `The request on line ${q.line} in ${filename} for quickinfo via ^? returned no from the compiler.`,
              `This is likely that the x positioning is off.`
            )
          }

          const queryResult: PartialQueryResults = {
            kind: "query",
            text,
            docs,
            line: q.line - i,
            offset: q.offset,
            file: filename,
          }
          return queryResult
        }

        case "completion": {
          const completions = ls.getCompletionsAtPosition(filename, position - 1, {})
          if (!completions && !handbookOptions.noErrorValidation) {
            throw new TwoslashError(
              `Invalid completion query`,
              `The request on line ${q.line} in ${filename} for completions via ^| returned no completions from the compiler.`,
              `This is likely that the positioning is off.`
            )
          }

          const word = getClosestWord(sourceFile.text, position - 1)
          const prefix = sourceFile.text.slice(word.startPos, position)
          const lastDot = prefix.split(".").pop() || ""

          const queryResult: PartialCompletionResults = {
            kind: "completions",
            completions: (completions?.entries) || [],
            completionPrefix: lastDot,
            line: q.line - i,
            offset: q.offset,
            file: filename,
          }
          return queryResult
        }

        default: 
          throw new TwoslashError('Unreachable', 'This should never happen', '')
      }
    })
    partialQueries = partialQueries.concat(lspedQueries)

    // Sets the file in the compiler as being without the comments
    const newEditedFileCode = codeLines.join("\n")
    env.updateFile(filename, newEditedFileCode)
  }

  // We need to also strip the highlights + queries from the main file which is shown to people
  const allCodeLines = code.split(/\r\n?|\n/g)
  filterHighlightLines(allCodeLines)
  code = allCodeLines.join("\n")

  // Lets fs changes propagate back up to the fsMap
  if (handbookOptions.emit) {
    filenames.forEach(f => {
      const filetype = f.split(".").pop() || ""
      if (!sourceFiles.includes(filetype)) return

      const output = ls.getEmitOutput(f)
      output.outputFiles.forEach(output => {
        system.writeFile(output.name, output.text)
      })
    })
  }

  // Code should now be safe to compile, so we're going to split it into different files
  let errs: import("typescript").Diagnostic[] = []
  // Let because of a filter when cutting
  let staticQuickInfos: TwoSlashReturn["staticQuickInfos"] = []

  // Iterate through the declared files and grab errors and LSP quickinfos
  // const declaredFiles = Object.keys(fileMap)

  filenames.forEach(file => {
    const filetype = file.split(".").pop() || ""

    // Only run the LSP-y things on source files
    if (!sourceFiles.includes(filetype)) {
      return
    }

    if (!handbookOptions.noErrors) {
      errs = errs.concat(ls.getSemanticDiagnostics(file), ls.getSyntacticDiagnostics(file))
    }

    const source = env.sys.readFile(file)!
    const sourceFile = env.getSourceFile(file)
    if (!sourceFile) {
      throw new TwoslashError(
        `Could not find a  TypeScript sourcefile for '${file}' in the Twoslash vfs`,
        `It's a little hard to provide useful advice on this error. Maybe you imported something which the compiler doesn't think is a source file?`,
        ``
      )
    }

    // Get all of the interesting quick info popover
    if (!handbookOptions.showEmit) {
      const fileContentStartIndexInModifiedFile = !code.includes(source) ? 0 : code.indexOf(source)
      const linesAbove = code.slice(0, fileContentStartIndexInModifiedFile).split("\n").length - 1

      // Get all interesting identifiers in the file, so we can show hover info for it
      const identifiers = handbookOptions.noStaticSemanticInfo ? [] : getIdentifierTextSpans(ts, sourceFile)
      for (const identifier of identifiers) {
        const span = identifier.span
        const quickInfo = ls.getQuickInfoAtPosition(file, span.start)

        if (quickInfo && quickInfo.displayParts) {
          const text = quickInfo.displayParts.map(dp => dp.text).join("")
          const targetString = identifier.text
          const docs = quickInfo.documentation ? quickInfo.documentation.map(d => d.text).join("\n") : undefined

          // Get the position of the
          const position = span.start + fileContentStartIndexInModifiedFile
          // Use TypeScript to pull out line/char from the original code at the position + any previous offset
          const burnerSourceFile = ts.createSourceFile("_.ts", code, ts.ScriptTarget.ES2015)
          const { line, character } = ts.getLineAndCharacterOfPosition(burnerSourceFile, position)

          staticQuickInfos.push({ text, docs, start: position, length: span.length, line, character, targetString })
        }
      }

      // Offset the queries for this file because they are based on the line for that one
      // specific file, and not the global twoslash document. This has to be done here because
      // in the above loops, the code for queries/highlights/etc hasn't been stripped yet.
      partialQueries
        .filter((q: any) => q.file === file)
        .forEach(q => {
          const pos =
            ts.getPositionOfLineAndCharacter(sourceFile, q.line, q.offset) + fileContentStartIndexInModifiedFile

          switch (q.kind) {
            case "query": {
              queries.push({
                docs: q.docs,
                kind: "query",
                start: pos + fileContentStartIndexInModifiedFile,
                length: q.text.length,
                text: q.text,
                offset: q.offset,
                line: q.line + linesAbove + 1,
              })
              break
            }
            case "completions": {
              queries.push({
                completions: q.completions,
                kind: "completions",
                start: pos + fileContentStartIndexInModifiedFile,
                completionsPrefix: q.completionPrefix,
                length: 1,
                offset: q.offset,
                line: q.line + linesAbove + 1,
              })
            }
          }
        })
    }
  })

  const relevantErrors = errs.filter(e => e.file && filenames.includes(e.file.fileName))

  // A validator that error codes are mentioned, so we can know if something has broken in the future
  if (!handbookOptions.noErrorValidation && relevantErrors.length) {
    validateCodeForErrors(relevantErrors, handbookOptions, extension, originalCode, fsRoot)
  }

  let errors: TwoSlashReturn["errors"] = []

  // We can't pass the ts.DiagnosticResult out directly (it can't be JSON.stringified)
  for (const err of relevantErrors) {
    const codeWhereErrorLives = env.sys.readFile(err.file!.fileName)!
    const lineOffset =
      codeLines.findIndex(line => {
        if (line.includes(`// @filename: `)) {
          const fileName = line.split("// @filename: ")[1].trim()
          return err.file!.fileName.endsWith(fileName)
        }
        return false
      }) + 1
    const fileContentStartIndexInModifiedFile = code.indexOf(codeWhereErrorLives)
    const renderedMessage = ts.flattenDiagnosticMessageText(err.messageText, "\n")
    const id = `err-${err.code}-${err.start}-${err.length}`
    const { line, character } = ts.getLineAndCharacterOfPosition(err.file!, err.start!)

    errors.push({
      category: err.category,
      code: err.code,
      length: err.length,
      start: err.start ? err.start + fileContentStartIndexInModifiedFile : undefined,
      line: line + lineOffset,
      character,
      renderedMessage,
      id,
    })
  }

  // Handle emitting files
  if (handbookOptions.showEmit) {
    // Get the file which created the file we want to show:
    const emitFilename = handbookOptions.showEmittedFile || defaultFileName
    const emitSourceFilename =
      fsRoot + emitFilename.replace(".jsx", "").replace(".js", "").replace(".d.ts", "").replace(".map", "")

    let emitSource = filenames.find(f => f === `${emitSourceFilename}.ts` || f === `${emitSourceFilename}.tsx`)

    if (!emitSource && !compilerOptions.outFile) {
      const allFiles = filenames.join(", ")
      // prettier-ignore
      throw new TwoslashError(
        `Could not find source file to show the emit for`,
        `Cannot find the corresponding **source** file  ${emitFilename} for completions via ^| returned no quickinfo from the compiler.`,
        `Looked for: ${emitSourceFilename} in the vfs - which contains: ${allFiles}`
      )
    }

    // Allow outfile, in which case you need any file.
    if (compilerOptions.outFile) {
      emitSource = filenames[0]
    }

    const output = ls.getEmitOutput(emitSource!)
    const file = output.outputFiles.find(
      o => o.name === fsRoot + handbookOptions.showEmittedFile || o.name === handbookOptions.showEmittedFile
    )

    if (!file) {
      const allFiles = output.outputFiles.map(o => o.name).join(", ")
      throw new TwoslashError(
        `Cannot find the output file in the Twoslash VFS`,
        `Looking for ${handbookOptions.showEmittedFile} in the Twoslash vfs after compiling`,
        `Looked for" ${fsRoot + handbookOptions.showEmittedFile} in the vfs - which contains ${allFiles}.`
      )
    }

    code = file.text
    extension = file.name.split(".").pop()!

    // Remove highlights and queries, because it won't work across transpiles,
    // though I guess source-mapping could handle the transition
    highlights = []
    partialQueries = []
    staticQuickInfos = []
  }

  // Cutting happens last, and it means editing the lines and character index of all
  // the type annotations which are attached to a location

  const cutString = "// ---cut---\n"
  const cutAfterString = "// ---cut-after---\n"

  if (code.includes(cutString)) {
    // Get the place it is, then find the end and the start of the next line
    const cutIndex = code.indexOf(cutString) + cutString.length
    const lineOffset = code.substr(0, cutIndex).split("\n").length - 1

    // Kills the code shown
    code = code.split(cutString).pop()!

    // For any type of metadata shipped, it will need to be shifted to
    // fit in with the new positions after the cut
    staticQuickInfos.forEach(info => {
      info.start -= cutIndex
      info.line -= lineOffset
    })
    staticQuickInfos = staticQuickInfos.filter(s => s.start > -1)

    errors.forEach(err => {
      if (err.start) err.start -= cutIndex
      if (err.line) err.line -= lineOffset
    })
    errors = errors.filter(e => e.start && e.start > -1)

    highlights.forEach(highlight => {
      highlight.start -= cutIndex
      highlight.line -= lineOffset
    })

    highlights = highlights.filter(e => e.start > -1)

    queries.forEach(q => (q.line -= lineOffset))
    queries = queries.filter(q => q.line > -1)

    tags.forEach(q => (q.line -= lineOffset))
    tags = tags.filter(q => q.line > -1)
  }


  if (code.includes(cutAfterString)) {

    // Get the place it is, then find the end and the start of the next line
    const cutIndex = code.indexOf(cutAfterString) + cutAfterString.length
    const lineOffset = code.substr(0, cutIndex).split("\n").length - 1

    // Kills the code shown, removing any whitespace on the end
    code = code.split(cutAfterString).shift()!.trimEnd()

    // Cut any metadata after the cutAfterString
    staticQuickInfos = staticQuickInfos.filter(s => s.line < lineOffset)
    errors = errors.filter(e => e.line && e.line < lineOffset)
    highlights = highlights.filter(e => e.line < lineOffset)
    queries = queries.filter(q => q.line < lineOffset)
    tags = tags.filter(q => q.line < lineOffset)
  }

  return {
    code,
    extension,
    highlights,
    queries,
    staticQuickInfos,
    errors,
    tags,
    /**
     * @deprecated removed in `twoslashes`
     */
    playgroundURL: '',
  }
}

function splitTwoslashCodeInfoFiles(code: string, defaultFileName: string, root: string) {
  const lines = code.split(/\r\n?|\n/g)

  let nameForFile = code.includes(`@filename: ${defaultFileName}`) ? "global.ts" : defaultFileName
  let currentFileContent: string[] = []
  const fileMap: Array<[string, string[]]> = []

  for (const line of lines) {
    if (line.includes("// @filename: ")) {
      fileMap.push([root + nameForFile, currentFileContent])
      nameForFile = line.split("// @filename: ")[1].trim()
      currentFileContent = []
    } else {
      currentFileContent.push(line)
    }
  }
  fileMap.push([root + nameForFile, currentFileContent])

  // Basically, strip these:
  // ["index.ts", []]
  // ["index.ts", [""]]
  const nameContent = fileMap.filter(n => n[1].length > 0 && (n[1].length > 1 || n[1][0] !== ""))
  return nameContent
}
