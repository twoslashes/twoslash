
import type { CompilerOptions, ScriptTarget } from 'typescript';
import { createFSBackedSystem, createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs';
import { TwoslashError } from './error';
import type { HandbookOptions, Range, Token, TokenError, TokenWithoutPosition, TwoSlashInstance, TwoSlashOptions, TwoSlashReturn } from "./types";
import { createPositionConverter, getIdentifierTextSpans, getOptionValueFromMap, isInRanges, mergeRanges, parsePrimitive, splitFiles, typesToExtension } from './utils';
import { validateCodeForErrors } from './validation';

export * from './error'
export * from './types';

type TS = typeof import("typescript")

// TODO: Make them configurable maybe
const reConfigBoolean = /^\/\/\s?@(\w+)$/mg;
const reConfigValue = /^\/\/\s?@(\w+):\s?(.+)$/mg;
const reMarkerHighlight = /^\s*\/\/\s*(\^+)( .+)?$/mg;
const reMarkerQuery = /^\s*\/\/\s*\^\?\s*$/mg;
const reMarkerCompletions = /^\s*\/\/\s*\^\|\s*$/mg;

const cutString = "// ---cut---\n";
const cutAfterString = "// ---cut-after---\n";
// TODO: cut range


interface OptionDeclaration {
  name: string;
  type: "list" | "boolean" | "number" | "string" | Map<string, any>;
  element?: OptionDeclaration;
}

/**
 * Create a TwoSlash instance with cached TS environments
 */
export function createTwoSlasher(options: Partial<TwoSlashOptions> = {}): TwoSlashInstance {
  const ts: TS = options.tsModule!;
  const defaultCompilerOptions: CompilerOptions = {
    strict: true,
    target: 99 satisfies ScriptTarget.ESNext,
    allowJs: true,
    ...(options.defaultCompilerOptions ?? {}),
  };

  const defaultHandbookOptions: HandbookOptions = {
    errors: [],
    noErrors: false,
    showEmit: false,
    showEmittedFile: undefined,
    noStaticSemanticInfo: false,
    emit: false,
    noErrorValidation: false,
    ...options.defaultOptions
  };

  const tsOptionDeclarations = ((ts as any).optionDeclarations as OptionDeclaration[])

  // In a browser we want to DI everything, in node we can use local infra
  const useFS = !!options.fsMap;
  const _root = options.vfsRoot!.replace(/\//g, "/"); // Normalize slashes
  const vfs = useFS && options.fsMap ? options.fsMap : new Map<string, string>();
  const system = useFS ? createSystem(vfs) : createFSBackedSystem(vfs, _root, ts, options.tsLibDirectory);
  const fsRoot = useFS ? "/" : `${_root}/`

  const cache = new Map<string, ReturnType<typeof createVirtualTypeScriptEnvironment>>();

  function getEnv(compilerOptions: CompilerOptions) {
    const key = JSON.stringify(compilerOptions);
    if (!cache.has(key)) {
      cache.set(key, createVirtualTypeScriptEnvironment(system, [], ts, compilerOptions, options.customTransformers));
    }
    return cache.get(key)!;
  }

  function twoslasher(
    code: string,
    extension = 'ts',
  ): TwoSlashReturn {
    const ext = typesToExtension(extension);
    const defaultFilename = `index.${ext}`;

    const _tokens: TokenWithoutPosition[] = [];
    let removals: Range[] = [];
    function isInRemoval(index: number) {
      return isInRanges(index, removals);
    }

    const compilerOptions: CompilerOptions = {
      ...defaultCompilerOptions,
    }

    const handbookOptions: HandbookOptions = {
      ...defaultHandbookOptions,
    }

    function updateOptions(name: string, value: any): false | void {
      const oc = tsOptionDeclarations.find((d) => d.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (oc) {
        switch (oc.type) {
          case "number":
          case "string":
          case "boolean":
            compilerOptions[oc.name] = parsePrimitive(value, oc.type);
            break;
          case "list": {
            const elementType = oc.element!.type;
            const strings = value.split(",") as string[];
            if (typeof elementType === "string") {
              compilerOptions[oc.name] = strings.map(v => parsePrimitive(v, elementType));
            } else {
              compilerOptions[oc.name] = strings.map(v => getOptionValueFromMap(oc.name, v, elementType as Map<string, string>));
            }
            break;
          }
          default:
            // It's a map
            compilerOptions[oc.name] = getOptionValueFromMap(oc.name, value, oc.type);
            break;
        }
      }
      else if (Object.keys(defaultHandbookOptions).includes(name)) {
        // "errors" is a special case, it's a list of numbers
        if (name === "errors" && typeof value === "string")
          value = value.split(" ").map(Number);

        (handbookOptions as any)[name] = value
      }
      else {
        if (handbookOptions.noErrorValidation)
          return false
        throw new TwoslashError(
          `Invalid inline compiler flag`,
          `There isn't a TypeScript compiler flag called '@${name}'.`,
          `This is likely a typo, you can check all the compiler flags in the TSConfig reference, or check the additional Twoslash flags in the npm page for @typescript/twoslash.`
        )
      }
    }

    // #extract compiler options
    Array.from(code.matchAll(reConfigBoolean)).forEach((match) => {
      const index = match.index!;
      const name = match[1];
      if (updateOptions(name, true) === false)
        return
      removals.push([index, index + match[0].length + 1]);
    });
    Array.from(code.matchAll(reConfigValue)).forEach((match) => {
      const index = match.index!;
      const name = match[1];
      if (name === 'filename')
        return
      const value = match[2];
      if (options.customTags?.includes(name)) {
        _tokens.push({
          type: 'tag',
          name,
          start: index + match[0].length + 1,
          length: 0,
          text: match[0].split(":")[1].trim(),
        })
      }
      else {
        if (updateOptions(name, value) === false)
          return
      }
      removals.push([index, index + match[0].length + 1]);
    });
    // #endregion

    const env = getEnv(compilerOptions)
    const ls = env.languageService;

    const targetsQuery: number[] = [];
    const targetsCompletions: number[] = [];
    const targetsHighlights: Range[] = [];
    const pc = createPositionConverter(code);

    // #region extract cuts
    if (code.includes(cutString)) {
      removals.push([0, code.indexOf(cutString) + cutString.length]);
    }
    if (code.includes(cutAfterString)) {
      removals.push([code.indexOf(cutAfterString), code.length]);
    }
    // #endregion

    const supportedFileTyes = ["js", "jsx", "ts", "tsx"]
    const files = splitFiles(code, defaultFilename, fsRoot)

    for (const file of files) {
      // Only run the LSP-y things on source files
      if (file.extension === "json") {
        if (!compilerOptions.resolveJsonModule)
          continue
      }
      else if (!supportedFileTyes.includes(file.extension)) {
        continue
      }

      env.createFile(file.filename, file.content);

      // #region extract markers
      if (file.content.includes("//")) {
        Array.from(file.content.matchAll(reMarkerQuery)).forEach((match) => {
          const index = match.index! + file.offset;
          removals.push([index, index + match[0].length + 1]);
          const markerIndex = index + match[0].indexOf("^");
          targetsQuery.push(pc.getIndexOfLineAbove(markerIndex));
        });

        Array.from(file.content.matchAll(reMarkerCompletions)).forEach((match) => {
          const index = match.index! + file.offset;
          removals.push([index, index + match[0].length + 1]);
          const markerIndex = index + match[0].indexOf("^");
          targetsCompletions.push(pc.getIndexOfLineAbove(markerIndex));
        });

        Array.from(file.content.matchAll(reMarkerHighlight)).forEach((match) => {
          const index = match.index! + file.offset;
          removals.push([index, index + match[0].length + 1]);
          const markerIndex = index + match[0].indexOf("^") + file.offset;
          const markerLength = match[1].length;
          const targetIndex = pc.getIndexOfLineAbove(markerIndex);
          targetsHighlights.push([
            targetIndex,
            targetIndex + markerLength,
          ]);
        });
      }
      // #endregion

      // #region get ts info for quick info
      const source = ls.getProgram()!.getSourceFile(file.filename)!;
      const identifiers = getIdentifierTextSpans(ts, source);
      for (const identifier of identifiers) {
        const start = identifier.span.start + file.offset
        if (isInRemoval(start))
          continue;

        // TODO: hooks to filter out some identifiers
        const span = identifier.span;
        const quickInfo = ls.getQuickInfoAtPosition(file.filename, span.start);

        if (quickInfo && quickInfo.displayParts) {
          const text = quickInfo.displayParts.map(dp => dp.text).join("");

          // TODO: get different type of docs
          const docs = quickInfo.documentation?.map(d => d.text).join("\n") || undefined;

          _tokens.push({
            type: 'hover',
            text,
            docs,
            start,
            length: span.length,
            target: identifier.text
          });
        }
      }
      // #endregion

      // #region update token with types
      _tokens.forEach(token => {
        if (token.type as any !== 'hover')
          return undefined;
        const range: Range = [token.start, token.start + token.length];
        // Turn static info to query if in range
        if (targetsQuery.find(target => isInRanges(target, [range]))) {
          token.type = 'query';
        }
        // Turn static info to completion if in range
        else if (targetsHighlights.find(target => isInRanges(target[0], [range]) || isInRanges(target[1], [range]))) {
          token.type = 'highlight';
        }
      });
      // #endregion

      // #region get completions
      targetsCompletions.forEach(target => {
        if (isInRemoval(target))
          return;
        const completions = ls.getCompletionsAtPosition(file.filename, target - 1, {});
        if (!completions && !handbookOptions.noErrorValidation) {
          const pos = pc.indexToPos(target);
          throw new TwoslashError(
            `Invalid completion query`,
            `The request on line ${pos} in ${file.filename} for completions via ^| returned no completions from the compiler.`,
            `This is likely that the positioning is off.`
          );
        }

        let prefix = code.slice(0, target - 1 + 1).match(/\S+$/)?.[0] || '';
        prefix = prefix.split('.').pop()!;

        _tokens.push({
          type: 'completion',
          start: target,
          length: 0,
          completions: (completions?.entries ?? []).filter(i => i.name.startsWith(prefix)),
          completionsPrefix: prefix
        });
      });
      // #endregion
    }


    // #region get diagnostics, after all files are mounted

    for (const file of files) {
      if (!supportedFileTyes.includes(file.extension)) {
        continue
      }

      if (!handbookOptions.noErrorValidation && !handbookOptions.noErrors) {
        const diagnostics = [
          ...ls.getSemanticDiagnostics(file.filename),
          ...ls.getSyntacticDiagnostics(file.filename),
        ]
          .filter(i => i.file?.fileName === file.filename);

        for (const diagnostic of diagnostics) {
          const start = diagnostic.start! + file.offset;
          const renderedMessage = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
          const id = `err-${diagnostic.code}-${diagnostic.start}-${diagnostic.length}`;

          _tokens.push({
            type: 'error',
            start,
            length: diagnostic.length!,
            code: diagnostic.code,
            filename: file.filename,
            id,
            text: renderedMessage,
            level: diagnostic.category,
          });
        }
      }
    }
    // #endregion

    // A validator that error codes are mentioned, so we can know if something has broken in the future
    const errors = _tokens.filter(i => i.type === 'error') as TokenError[];
    if (!handbookOptions.noErrorValidation && errors.length) {
      validateCodeForErrors(errors, handbookOptions, fsRoot)
    }

    // Sort descending, so that we start removal from the end
    removals = mergeRanges(removals)
      .sort((a, b) => b[0] - a[0]);

    // TODO: option to disable removals
    let outputCode = code;
    for (const remove of removals) {
      const removalLength = remove[1] - remove[0];
      outputCode = outputCode.slice(0, remove[0]) + outputCode.slice(remove[1]);
      _tokens.forEach(token => {
        // tokens before the range, do nothing
        if (token.start + token.length <= remove[0]) {
          return undefined;
        }
        // remove tokens that are within in the range
        else if (token.start < remove[1]) {
          token.start = -1;
        }
        // move tokens after the range forward
        else {
          token.start -= removalLength;
        }
      });
    }


    const resultPC = outputCode === code ? pc : createPositionConverter(outputCode);

    const tokens = _tokens
      .filter(token => token.start >= 0)
      .sort((a, b) => a.start - b.start)
      .map(token => {
        return {
          ...token,
          ...resultPC.indexToPos(token.start),
        } as Token;
      })

    return {
      code: outputCode,
      tokens,
      meta: {
        extension: ext,
        compilerOptions,
        handbookOptions,
        removals,
      },

      get queries() {
        return tokens.filter(i => i.type === 'query') as any
      },
      get completions() {
        return tokens.filter(i => i.type === 'completion') as any
      },
      get errors() {
        return tokens.filter(i => i.type === 'error') as any
      },
      get highlights() {
        return tokens.filter(i => i.type === 'highlight') as any
      },
      get hovers() {
        return tokens.filter(i => i.type === 'hover') as any
      },
      get tags() {
        return tokens.filter(i => i.type === 'tag') as any
      },
    };
  }

  twoslasher.dispose = () => {
    cache.clear();
  }

  twoslasher.getCacheMap = () => {
    return cache;
  }

  return twoslasher;
}

/**
 * Run TwoSlash on a string of code
 * 
 * It's recommended to use `createTwoSlash` for better performance on multiple runs
 */
export function twoslasher(code: string, lang?: string, opts?: TwoSlashOptions) {
  return createTwoSlasher(opts)(code, lang)
}
