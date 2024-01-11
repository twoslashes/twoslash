import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    benchmark: {
      // reporters: ['default', 'json'],
      // outputFile: {
      //   json: 'bench/results.json'
      // }
    }
  }
})
