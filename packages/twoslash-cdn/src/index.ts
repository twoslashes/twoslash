import type { TwoslashExecuteOptions, TwoslashFunction, TwoslashOptions, TwoslashReturn } from 'twoslash'
import { createTwoslasher } from 'twoslash'
import * as ts from 'typescript/lib/tsserverlibrary'
import { createDefaultMapFromCDN } from '@typescript/vfs'
import { setupTypeAcquisition } from '@typescript/ata'

/**
 * A subset of `unstorage`'s interface to maximize the compatibility
 *
 * @see https://github.com/unjs/unstorage
 */
export interface PesudoStorage {
  getItemRaw: (key: string) => string | Promise<string | null>
  setItemRaw: (key: string, value: string) => void | Promise<void>
}

export interface TwoslashCdnOptions {
  /**
   * Storage for persistent caching
   *
   * Supports `unstorage`'s interface
   * @see https://github.com/unjs/unstorage
   */
  storage?: PesudoStorage

  /**
   * TypeScript compiler options
   */
  compilerOptions?: ts.CompilerOptions

  /**
   * Twoslash options Overrides
   *
   * Options `tsModule`, `lzstringModule` and `fsMap` are controlled by this function
   */
  twoSlashOptionsOverrides?: Omit<TwoslashOptions, 'tsModule' | 'fsMap' | 'cache'>

  /**
   * A map of file paths to virtual file contents
   */
  fsMap?: Map<string, string>

  /**
   * Custom fetch function. When `unstorage` is provided, we will wrap the fetch function to cache the response.
   */
  fetcher?: typeof fetch
}

export interface TwoslashCdnReturn {
  /**
   * Run auto type acquisition and then twoslash on the given code
   */
  run: (code: string, extension?: string, options?: TwoslashExecuteOptions) => Promise<TwoslashReturn>

  /**
   * Run twoslasher on the given code, without running ATA
   */
  runSync: TwoslashFunction

  /**
   * Runs Auto-Type-Acquisition (ATA) on the given code, the async operation before running twoslash
   * @param code
   */
  prepareTypes: (source: string) => Promise<void>

  /**
   * Load the default TypeScript types library from CDN
   * Automatically called by `run` and `prepareTypes`
   */
  init: () => Promise<void>

  /**
   * The fetch function used by the instance
   */
  fetcher: typeof fetch
}

export function createTwoslashFromCDN(options: TwoslashCdnOptions = {}): TwoslashCdnReturn {
  const fetcher = (
    options.storage
      ? createCachedFetchFromStorage(options.storage, options.fetcher || fetch)
      : options.fetcher || fetch
  )
  const fsMap = options.fsMap || new Map<string, string>()

  let initPromise: Promise<void> | undefined
  async function _init() {
    const newMap = await createDefaultMapFromCDN(
      options.compilerOptions || {},
      ts.version,
      false,
      ts,
      undefined,
      fetcher,
    )

    newMap.forEach((value, key) => {
      fsMap.set(key, value)
    })
  }

  function init() {
    if (!initPromise)
      initPromise = _init()
    return initPromise
  }

  const ata = setupTypeAcquisition({
    projectName: 'twoslash-cdn',
    typescript: ts,
    fetcher,
    delegate: {
      receivedFile: (code: string, path: string) => {
        // console.log("ATA received", path);
        fsMap.set(path, code)
      },
    },
  })

  async function prepareTypes(code: string) {
    await Promise.all([
      init(),
      ata(code),
    ])
  }

  const twoslasher = createTwoslasher({
    ...options.twoSlashOptionsOverrides,
    tsModule: ts,
    fsMap,
  })

  async function run(source: string, extension?: string, localOptions?: TwoslashExecuteOptions) {
    await prepareTypes(source)
    return runSync(source, extension, localOptions)
  }

  function runSync(source: string, extension?: string, localOptions?: TwoslashExecuteOptions) {
    return twoslasher(source, extension, {
      ...options.twoSlashOptionsOverrides,
      ...localOptions,
    })
  }

  return {
    run,
    runSync,
    init,
    prepareTypes,
    fetcher,
  }
}

/**
 * Create a cached fetch function from an unstorage instance
 *
 * @see https://github.com/unjs/unstorage
 * @param storage
 * @param nativeFetch
 */
export function createCachedFetchFromStorage(
  storage: PesudoStorage,
  nativeFetch: typeof fetch = fetch,
): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const shouldCache = !init || (init?.method === 'GET' && init?.cache !== 'no-store')
    const cached = shouldCache
      ? await storage.getItemRaw(url)
      : undefined
    if (cached != null) {
      // console.log("cached", url);
      return new Response(cached as any, init)
    }
    else {
      // console.log("fetching", url);
      const response = await nativeFetch(url, init)
      if (shouldCache)
        response.clone().text().then(text => storage.setItemRaw(url, text))
      return response
    }
  }) as any
}
