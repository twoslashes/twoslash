import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
  ],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
  },
  hooks: {
    'build:done': () => {
      const typeFiles = [
        'svelte-jsx.d.ts',
        'svelte-jsx-v4.d.ts',
        'svelte-shims.d.ts',
        'svelte-shims-v4.d.ts',
      ]
      const svelte2tsxPath = dirname(require.resolve('svelte2tsx/svelte-jsx.d.ts'))
      // eslint-disable-next-line node/prefer-global/process
      const destPath = resolve(process.cwd(), 'dist/types')
      mkdirSync(destPath, { recursive: true })
      typeFiles.forEach((file) => {
        const sourcePath = resolve(svelte2tsxPath, file)
        const destFilePath = resolve(destPath, file)

        try {
          copyFileSync(sourcePath, destFilePath)
          console.log(`Copied ${file} to dist/types`)
        }
        catch (error) {
          console.error(`Failed to copy ${file}:`, error)
        }
      })
    },
  },
})
