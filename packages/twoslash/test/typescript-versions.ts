import type { CreateTwoslashOptions } from '../src/types'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import ts6 from 'typescript'
import ts5 from 'typescript5'
import ts7 from 'typescript7'

const require = createRequire(import.meta.url)
const packageDirectory = (name: string) => dirname(require.resolve(`${name}/package.json`))

interface TypeScriptVersion extends CreateTwoslashOptions {
  /** Folder name of the fixture results */
  id: string
  /** Fixtures matching are skipped for this version */
  unsupportedFixtures?: RegExp
}

/**
 * Every TypeScript major Twoslash supports
 */
export const typescriptVersions: TypeScriptVersion[] = [
  {
    id: 'ts5',
    // Types are resolved from TypeScript 6, the module shapes Twoslash relies on are the same
    tsModule: ts5 as unknown as typeof ts6,
    // `@typescript/vfs` would load the lib files of the `typescript` package otherwise
    tsLibDirectory: `${packageDirectory('typescript5')}/lib`,
  },
  {
    id: 'ts6',
    tsModule: ts6,
  },
  {
    id: 'ts7',
    // The TypeScript 7 entry only exposes its version
    tsModule: ts7 as unknown as typeof ts6,
    tsPackageDirectory: packageDirectory('typescript7'),
    // TypeScript 7 can't emit, and removed `moduleResolution: node`
    unsupportedFixtures: /@showEmit|@moduleResolution: node$/m,
  },
]
