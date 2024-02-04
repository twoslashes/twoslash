import type { NodeErrorWithoutPosition } from './types'
import { TwoslashError } from './error'

/** To ensure that errors are matched up right */
export function validateCodeForErrors(
  relevantErrors: NodeErrorWithoutPosition[],
  handbookOptions: { errors: number[] },
  vfsRoot: string,
) {
  const unspecifiedErrors = relevantErrors.filter(e => e.code && !handbookOptions.errors.includes(e.code as number))
  const errorsFound = Array.from(new Set(unspecifiedErrors.map(e => e.code))).join(' ')

  if (unspecifiedErrors.length) {
    const errorsToShow = new Set(relevantErrors.map(e => e.code))
    const codeToAdd = `// @errors: ${Array.from(errorsToShow).join(' ')}`

    const missing = handbookOptions.errors.length
      ? `\nThe existing annotation specified ${handbookOptions.errors.join(' ')}`
      : `\nExpected: ${codeToAdd}`

    // These get filled by below
    const filesToErrors: Record<string, NodeErrorWithoutPosition[]> = {}
    const noFiles: NodeErrorWithoutPosition[] = []

    unspecifiedErrors.forEach((d) => {
      const fileRef = d.filename?.replace(vfsRoot, '')
      if (!fileRef) {
        noFiles.push(d)
      }
      else {
        const existing = filesToErrors[fileRef]
        if (existing)
          existing.push(d)
        else filesToErrors[fileRef] = [d]
      }
    })

    const showDiagnostics = (title: string, diags: NodeErrorWithoutPosition[]) => {
      return (`${title}\n  ${diags
        .map(e => `[${e.code}] ${e.start} - ${e.text}`)
        .join('\n  ')}`
      )
    }

    const innerDiags: string[] = []
    if (noFiles.length)
      innerDiags.push(showDiagnostics('Ambient Errors', noFiles))

    Object.keys(filesToErrors).forEach((filepath) => {
      innerDiags.push(showDiagnostics(filepath, filesToErrors[filepath]))
    })

    const allMessages = innerDiags.join('\n\n')

    const newErr = new TwoslashError(
      `Errors were thrown in the sample, but not included in an error tag`,
      `These errors were not marked as being expected: ${errorsFound}. ${missing}`,
      `Compiler Errors:\n\n${allMessages}`,
    )

    throw newErr
  }
}

/** Mainly to warn myself, I've lost a good few minutes to this before */
export function validateInput(code: string) {
  if (code.includes('// @errors ')) {
    throw new TwoslashError(
      `You have '// @errors ' (with a space)`,
      `You want '// @errors: ' (with a colon)`,
      `This is a pretty common typo`,
    )
  }

  if (code.includes('// @filename ')) {
    throw new TwoslashError(
      `You have '// @filename ' (with a space)`,
      `You want '// @filename: ' (with a colon)`,
      `This is a pretty common typo`,
    )
  }
}
