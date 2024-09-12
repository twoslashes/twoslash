import type { NodeErrorWithoutPosition, TwoslashGenericFunction, TwoslashGenericResult } from 'twoslash-protocol'
import { Linter } from 'eslint'
import { createPositionConverter, resolveNodePositions } from 'twoslash-protocol'

export interface CreateTwoslashESLintOptions {
  /**
   * Flat configs for ESLint
   */
  eslintConfig: Linter.FlatConfig[]

  /**
   * Custom code transform before sending to ESLint for verification
   *
   * This does not affect the code rendering
   */
  eslintCodePreprocess?: (code: string) => string

  /**
   * The current working directory for ESLint
   */
  cwd?: string

  /**
   * Include the parsed docs in the result
   *
   * @default true
   */
  includeDocs?: boolean

  /**
   * Merge error messages that has same range
   * @default true
   */
  mergeMessages?: boolean
}

export function createTwoslasher(options: CreateTwoslashESLintOptions): TwoslashGenericFunction {
  const {
    includeDocs = true,
    mergeMessages = true,
  } = options

  const linter = new Linter({
    cwd: options.cwd,
    configType: 'flat',
  })

  let docsMap: Map<string, string | undefined>
  function getDocsMap() {
    if (!docsMap) {
      docsMap = new Map()
      for (const config of options.eslintConfig) {
        Object.entries(config.plugins || {}).forEach(([pluginName, plugin]) => {
          Object.entries(plugin?.rules || {}).forEach(([ruleName, rule]) => {
            if ('meta' in rule) {
              const docs = rule.meta?.docs?.url
              if (docs)
                docsMap.set(`${pluginName}/${ruleName}`, docs)
            }
          })
        })
      }
    }
    return docsMap
  }

  return (code, file) => {
    const filename = file?.includes('.') ? file : `index.${file ?? 'ts'}`
    const messages = linter.verify(
      options.eslintCodePreprocess?.(code) || code,
      options.eslintConfig,
      { filename },
    )

    const pc = createPositionConverter(code)
    const raws: NodeErrorWithoutPosition[] = messages.map((message): NodeErrorWithoutPosition => {
      const start = pc.posToIndex(message.line - 1, message.column - 1)
      const end = message.endLine != null && message.endColumn != null
        ? pc.posToIndex(message.endLine - 1, message.endColumn - 1)
        : start + 1

      let text = message.message
      if (message.ruleId) {
        const link = includeDocs && getDocsMap().get(message.ruleId)
        text += link
          ? ` ([${message.ruleId}](${link}))`
          : ` (${message.ruleId})`
      }

      return {
        type: 'error',
        id: message.ruleId || '',
        code: 0,
        text,
        start,
        length: end - start,
        level: message.severity === 2 ? 'error' : 'warning',
        filename,
      }
    })

    let merged: NodeErrorWithoutPosition[] = []
    if (mergeMessages) {
      for (const current of raws) {
        const existing = merged.find(r => r.start === current.start && r.length === current.length)
        if (existing) {
          existing.text += `\n\n${current.text}`
          continue
        }
        merged.push(current)
      }
    }
    else {
      merged = raws
    }

    const nodes = resolveNodePositions(merged, code)
      .filter(i => i.line < pc.lines.length) // filter out messages outside of the code

    const results: TwoslashGenericResult = {
      code,
      nodes,
    }

    return results
  }
}
