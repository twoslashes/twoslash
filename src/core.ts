import type { CompilerOptions, ScriptTarget } from 'typescript';
import { createFSBackedSystem, createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs';
import { TwoslashError } from './error';
import type { Position, Range, Token, TokenCompletion, TokenError, TokenHighlight, TokenQuery, TokenQuickInfo, TokenTag, TokenWithPosition, TwoSlashReturnNew } from "./types-new";
import type { HandbookOptions, TwoSlashOptions } from './types';
import { createPosConverter, getIdentifierTextSpans, getOptionValueFromMap, isInRanges, mergeRanges, parsePrimitive, typesToExtension } from './utils';
import { validateCodeForErrors } from './validation';

export * from './error'
export * from './types';
export * from './types-new';

type TS = typeof import("typescript")

const ignoredErrors = [
  6133, // not in used
]

// TODO: Make them configurable maybe
const reConfigBoolean = /^\/\/\s?@(\w+)$/mg;
const reConfigValue = /^\/\/\s?@(\w+):\s?(.+)$/mg;
const reMarkerHighlight = /^\s*\/\/\s*(\^+)( .+)?$/mg;
const reMarkerQuery = /^\s*\/\/\s*\^\?\s*$/mg;
const reMarkerCompletions = /^\s*\/\/\s*\^\|\s*$/mg;

const cutString = "// ---cut---\n";
const cutAfterString = "// ---cut-after---\n";
// TODO: cut range

// Keys in this object are used to filter out handbook options
// before compiler options are set.
const defaultHandbookOptions: HandbookOptions = {
  errors: [],
  noErrors: false,
  showEmit: false,
  showEmittedFile: undefined,
  noStaticSemanticInfo: false,
  emit: false,
  noErrorValidation: false,
}

export function twoslasherNew(
  code: string,
  extension: string,
  options: Partial<TwoSlashOptions> = {}
): TwoSlashReturnNew {
  const ts: TS = options.tsModule!;
  const ext = typesToExtension(extension);
  const filename = `index.${ext}`;

  let tokens: Token[] = [];
  let removals: Range[] = [];
  function isInRemoval(index: number) {
    return isInRanges(index, removals);
  }

  const compilerOptions: CompilerOptions = {
    strict: true,
    target: 99 satisfies ScriptTarget.ESNext,
    allowJs: true,
    ...(options.defaultCompilerOptions ?? {}),
  };

  const handbookOptions: HandbookOptions = {
    ...defaultHandbookOptions,
    ...options.defaultOptions
  };

  function updateOptions(name: string, value: any) {
    const compilerOpt = ts.optionDeclarations.find((d) => d.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (compilerOpt) {
      switch (compilerOpt.type) {
        case "number":
        case "string":
        case "boolean":
          compilerOptions[compilerOpt.name] = parsePrimitive(value, compilerOpt.type);
          break;
        case "list": {
          const elementType = compilerOpt.element!.type;
          const strings = value.split(",") as string[];
          if (typeof elementType === "string") {
            compilerOptions[compilerOpt.name] = strings.map(v => parsePrimitive(v, elementType));
          } else {
            compilerOptions[compilerOpt.name] = strings.map(v => getOptionValueFromMap(compilerOpt.name, v, elementType as Map<string, string>));
          }
          break;
        }
        default:
          // It's a map
          compilerOptions[compilerOpt.name] = getOptionValueFromMap(compilerOpt.name, value, compilerOpt.type);
          break;
      }
    }
    else {
      (handbookOptions as any)[name] = value;
    }
  }

  // #extract compiler options
  Array.from(code.matchAll(reConfigBoolean)).forEach((match) => {
    const index = match.index!;
    const name = match[1];
    updateOptions(name, true);
    removals.push([index, index + match[0].length + 1]);
  });
  Array.from(code.matchAll(reConfigValue)).forEach((match) => {
    const index = match.index!;
    const name = match[1];
    const value = match[2];
    updateOptions(name, value);
    removals.push([index, index + match[0].length + 1]);
  });
  // #endregion
  const getRoot = () => options.vfsRoot!.replace(/\//g, "/"); // Normalize slashes

  // In a browser we want to DI everything, in node we can use local infra
  const useFS = !!options.fsMap;
  const vfs = useFS && options.fsMap ? options.fsMap : new Map<string, string>();
  const system = useFS ? createSystem(vfs) : createFSBackedSystem(vfs, getRoot(), ts, options.tsLibDirectory);
  const fsRoot = useFS ? "/" : `${getRoot()}/`

  const env = createVirtualTypeScriptEnvironment(system, [], ts, compilerOptions, options.customTransformers);
  const ls = env.languageService;

  env.createFile(filename, code);

  const targetsQuery: number[] = [];
  const targetsCompletions: number[] = [];
  const targetsHighlights: Range[] = [];
  const pc = createPosConverter(code);

  // #region extract cuts
  if (code.includes(cutString)) {
    removals.push([0, code.indexOf(cutString) + cutString.length]);
  }
  if (code.includes(cutAfterString)) {
    removals.push([code.indexOf(cutAfterString), code.length]);
  }
  // #endregion

  // #region extract markers
  if (code.includes("//")) {
    Array.from(code.matchAll(reMarkerQuery)).forEach((match) => {
      const index = match.index!;
      removals.push([index, index + match[0].length + 1]);
      const markerIndex = index + match[0].indexOf("^");
      targetsQuery.push(pc.getIndexOfLineAbove(markerIndex));
    });

    Array.from(code.matchAll(reMarkerCompletions)).forEach((match) => {
      const index = match.index!;
      removals.push([index, index + match[0].length + 1]);
      const markerIndex = index + match[0].indexOf("^");
      targetsCompletions.push(pc.getIndexOfLineAbove(markerIndex));
    });

    Array.from(code.matchAll(reMarkerHighlight)).forEach((match) => {
      const index = match.index!;
      removals.push([index, index + match[0].length + 1]);
      const markerIndex = index + match[0].indexOf("^");
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
  const source = ls.getProgram()!.getSourceFile(filename)!;
  const identifiers = getIdentifierTextSpans(ts, source);
  for (const identifier of identifiers) {
    if (isInRemoval(identifier.span.start))
      continue;

    // TODO: hooks to filter out some identifiers
    const span = identifier.span;
    const quickInfo = ls.getQuickInfoAtPosition(filename, span.start);

    if (quickInfo && quickInfo.displayParts) {
      const text = quickInfo.displayParts.map(dp => dp.text).join("");

      // TODO: get different type of docs
      const docs = quickInfo.documentation?.map(d => d.text).join("\n") || undefined;

      const position = span.start;

      tokens.push({
        type: 'quick-info',
        text, docs,
        offset: position,
        length: span.length,
        target: identifier.text
      });
    }
  }
  // #endregion

  // #region update token with types
  tokens.forEach(token => {
    if (token.type as any !== 'quick-info')
      return undefined;
    const range: Range = [token.offset, token.offset + token.length];
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
    const completions = ls.getCompletionsAtPosition(filename, target - 1, {});
    if (!completions && !handbookOptions.noErrorValidation) {
      const pos = pc.indexToPos(target);
      throw new TwoslashError(
        `Invalid completion query`,
        `The request on line ${pos} in ${filename} for completions via ^| returned no completions from the compiler.`,
        `This is likely that the positioning is off.`
      );
    }

    let prefix = code.slice(0, target - 1 + 1).match(/\S+$/)?.[0] || '';
    prefix = prefix.split('.').pop()!;

    tokens.push({
      type: 'completion',
      offset: target,
      length: 0,
      completions: (completions?.entries ?? []).filter(i => i.name.startsWith(prefix)),
      completionsPrefix: prefix
    });
  });
  // #endregion

  // #region get diagnostics
  if (!handbookOptions.noErrorValidation) {
    const diagnostics = [
      ...ls.getSemanticDiagnostics(filename),
      ...ls.getSuggestionDiagnostics(filename),
    ]
      .filter(i => i.file?.fileName === filename && !ignoredErrors.includes(i.code) && !isInRemoval(i.start!));

    for (const diagnostic of diagnostics) {
      const start = diagnostic.start!;
      const renderedMessage = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      const id = `err-${diagnostic.code}-${diagnostic.start}-${diagnostic.length}`;

      tokens.push({
        type: 'error',
        offset: start,
        length: diagnostic.length!,
        code: diagnostic.code,
        id,
        renderedMessage,
        category: diagnostic.category,
      });
    }
    // A validator that error codes are mentioned, so we can know if something has broken in the future
    if (!handbookOptions.noErrorValidation && diagnostics.length) {
      validateCodeForErrors(diagnostics, handbookOptions, extension, code, fsRoot)
    }
  }
  // #endregion

  // Sort descending, so that we start removal from the end
  removals = mergeRanges(removals)
    .sort((a, b) => b[0] - a[0]);

  // TODO: option to disable removals
  let outputCode = code;
  for (const remove of removals) {
    const removalLength = remove[1] - remove[0];
    outputCode = outputCode.slice(0, remove[0]) + outputCode.slice(remove[1]);
    tokens.forEach(token => {
      // tokens before the range, do nothing
      if (token.offset < remove[0]) {
        return undefined;
      }

      // remove tokens that are within in the range
      else if (token.offset <= remove[1]) {
        token.offset = -1;
      }

      // move tokens after the range forward
      else {
        token.offset -= removalLength;
      }
    });
  }

  tokens = tokens
    .filter(token => token.offset !== -1)
    .sort((a, b) => a.offset - b.offset);

  return {
    original: code,
    code: outputCode,
    extension: ext,
    tokens,
    compilerOptions,
    removals,
  };
}

export function twoslasher(code: string, extension: string, options: Partial<TwoSlashOptions> = {}) {
  const result = twoslasherNew(code, extension, options)
  
  const pc = createPosConverter(result.code);

  const tokens = result.tokens.map(token => {
    return {
      ...token,
      ...pc.indexToPos(token.offset)
    } as TokenWithPosition
  })

  return {
    ...result,
    staticQuickInfos: tokens.filter(i => i.type === 'quick-info') as (TokenQuickInfo & Position)[],
    queries: tokens.filter(i => i.type === 'query') as (TokenQuery & Position)[],
    highlights: tokens.filter(i => i.type === 'highlight') as (TokenHighlight & Position)[],
    completions: tokens.filter(i => i.type === 'completion') as (TokenCompletion & Position)[],
    errors: tokens.filter(i => i.type === 'error') as (TokenError & Position)[],
    tags: tokens.filter(i => i.type === 'tag') as (TokenTag & Position)[],
  }
}
