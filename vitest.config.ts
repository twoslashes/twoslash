import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: ['default', 'json'],
    benchmark: {
      outputFile: 'bench/results.json'
    }
  }
})
