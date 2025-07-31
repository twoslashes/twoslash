import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

export interface CacheOptions {
  dir?: string
  namespace?: string
  version?: string | number
}

export class FileCache<V> {
  private dir: string

  constructor({
    namespace = 'twoslash',
    version = 1,
    dir,
  }: CacheOptions = {}) {
    const ns = namespace ?? 'twoslash'
    const ver = `v${version}`
    const root = dir ?? path.join(process.cwd(), 'node_modules', '.cache', ns)
    this.dir = path.join(root, ver)

    try {
      fs.mkdirSync(this.dir, { recursive: true })
    }
    catch {
      // Fallback to a temp directory if the cache directory cannot be created
      const fb = path.join(os.tmpdir(), ns, ver)
      fs.mkdirSync(fb, { recursive: true })
      this.dir = fb
    }
  }

  has(key: string): boolean {
    return fs.existsSync(this.file(key))
  }

  get(key: string): V | undefined {
    try {
      return JSON.parse(fs.readFileSync(this.file(key), 'utf8')) as V
    }
    catch {
      return undefined
    }
  }

  set(key: string, value: V): void {
    const file = this.file(key)
    fs.writeFileSync(file, JSON.stringify(value), 'utf8')
  }

  private file(key: string): string {
    return path.join(this.dir, `${key}.json`)
  }
}
