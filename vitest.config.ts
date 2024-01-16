import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      twoslash: fileURLToPath(new URL('./packages/twoslash/src/index.ts', import.meta.url)),
    },
  },
  test: {
    benchmark: {
      // reporters: ['default', 'json'],
      // outputFile: {
      //   json: 'bench/results.json'
      // }
    },
    coverage: {
      include: [
        '**/src/**/*.ts',
      ],
      exclude: [
        '**/twoslash-cdn/**',
        '**/types/**',
      ],
    },
  },
})
