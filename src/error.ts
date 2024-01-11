export class TwoslashError extends Error {
  public title: string
  public description: string
  public recommendation: string
  public code: string | undefined

  constructor(title: string, description: string, recommendation: string, code?: string | undefined) {
    let message = `
## ${title}

${description}
`
    if (recommendation)
      message += `\n${recommendation}`

    if (code)
      message += `\n${code}`

    super(message)
    this.title = title
    this.description = description
    this.recommendation = recommendation
    this.code = code
  }
}
