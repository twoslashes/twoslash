import { describe, expect, it } from 'vitest'
import { createTwoslasher } from '../src/index'

describe('edge cases', () => {
  it('should return generated code when debugShowGeneratedCode is true', () => {
    const twoslasher = createTwoslasher({ debugShowGeneratedCode: true })
    const code = `
<script>
  let a = 1
</script>
<h1>{a}</h1>
`
    const result = twoslasher(code, 'svelte')
    // Svelte2Tsx generated output
    expect(result.code).toContain('let a = 1')
    expect(result.code).not.toEqual(code) // should be the TSX version
  })

  it('should keep notations when keepNotations is true', () => {
    const twoslasher = createTwoslasher()
    const code = `
<script>
  let a = 1
  //  ^?
</script>
`
    const result = twoslasher(code, 'svelte', { handbookOptions: { keepNotations: true } })
    expect(result.meta.removals.length).toBeGreaterThan(0)
    // The notation should still be there because keepNotations is true
    expect(result.code).toContain('//  ^?')
  })

  it('should ignore non-svelte files', () => {
    const twoslasher = createTwoslasher()
    const result = twoslasher('const a = 1', 'ts')
    expect(result.code).toBe('const a = 1')
  })
})
