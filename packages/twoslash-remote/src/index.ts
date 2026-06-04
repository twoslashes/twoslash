import type { TwoslashGenericResult } from 'twoslash-protocol'
import type { TwoslashRemoteErrorPayload, TwoslashRemoteRequest } from './shared'
import { TWOSLASH_REMOTE_CONTENT_TYPE } from './shared'

export * from './shared'

/**
 * Per-call transport-level options.
 *
 * Separate from the twoslasher options (third argument to `.run`) because
 * these never reach the backend — they only affect the HTTP call itself.
 */
export interface TwoslashRemoteTransportOptions {
  /**
   * Free-form metadata sent alongside the request. The server backend
   * decides what to do with it (tenant id, theme hint, request id, ...).
   */
  meta?: Record<string, unknown>

  /**
   * Per-call headers merged on top of the instance-level `headers`.
   */
  headers?: HeadersInit

  /**
   * Per-call abort signal, forwarded to `fetch`.
   */
  signal?: AbortSignal
}

export interface TwoslashRemoteOptions {
  /**
   * Absolute URL of the twoslash remote endpoint to POST to.
   */
  endpoint: string

  /**
   * Override the `fetch` implementation. Useful for testing (in-memory
   * handler), adding auth headers, caching, etc. Defaults to `globalThis.fetch`.
   */
  fetcher?: typeof fetch

  /**
   * Headers merged into every request made by this instance.
   * Per-call `headers` win on conflict.
   */
  headers?: HeadersInit

  /**
   * Transform the outgoing request before serialization. Useful for adding
   * default `meta`, validating, redacting, etc.
   */
  onRequest?: (request: TwoslashRemoteRequest) => TwoslashRemoteRequest | Promise<TwoslashRemoteRequest>

  /**
   * Transform the incoming result before it's returned from `.run()`.
   */
  onResponse?: (result: TwoslashGenericResult) => TwoslashGenericResult | Promise<TwoslashGenericResult>
}

export interface TwoslashRemoteInstance {
  /**
   * The endpoint this instance posts to.
   */
  readonly endpoint: string

  /**
   * The resolved `fetch` implementation used by this instance.
   */
  readonly fetcher: typeof fetch

  /**
   * Send `code` (and optional twoslasher options) to the remote endpoint
   * and resolve with the returned `TwoslashGenericResult`.
   *
   * @param code The source code to run twoslash on.
   * @param extension Optional language hint (e.g. `'ts'`, `'vue'`).
   * @param options Serializable twoslasher options forwarded to the backend.
   * @param transport Transport-only options (meta, headers, signal).
   */
  run: <TOptions extends Record<string, unknown> = Record<string, unknown>>(
    code: string,
    extension?: string,
    options?: TOptions,
    transport?: TwoslashRemoteTransportOptions,
  ) => Promise<TwoslashGenericResult>
}

/**
 * Error thrown by the client when the remote endpoint returns a non-2xx
 * response. Carries the parsed error payload if the body was JSON.
 */
export class TwoslashRemoteError extends Error {
  override readonly name = 'TwoslashRemoteError'
  /** HTTP status code from the failed response. */
  readonly status: number
  /** Parsed `{ error: ... }` JSON body, if the server returned one. */
  readonly payload: TwoslashRemoteErrorPayload | undefined
  /** The raw `Response`, in case the caller needs headers etc. */
  readonly response: Response | undefined

  constructor(message: string, init: {
    status: number
    payload?: TwoslashRemoteErrorPayload
    response?: Response
    cause?: unknown
  }) {
    super(message, init.cause != null ? { cause: init.cause } : undefined)
    this.status = init.status
    this.payload = init.payload
    this.response = init.response
  }
}

/**
 * Create a Twoslash client that resolves snippets by posting them to a
 * remote HTTP endpoint. Returns a `TwoslashGenericResult`, compatible with
 * Shiki transformers and any tooling built on the twoslash protocol.
 */
export function createTwoslashFromRemote(options: TwoslashRemoteOptions): TwoslashRemoteInstance {
  if (!options.endpoint || typeof options.endpoint !== 'string')
    throw new TypeError('twoslash-remote: `endpoint` is required and must be a string')

  const fetcher = options.fetcher ?? globalThis.fetch
  if (typeof fetcher !== 'function')
    throw new TypeError('twoslash-remote: no global `fetch` is available; pass `fetcher` explicitly')

  const endpoint = options.endpoint

  async function run<TOptions extends Record<string, unknown>>(
    code: string,
    extension?: string,
    twoslasherOptions?: TOptions,
    transport: TwoslashRemoteTransportOptions = {},
  ): Promise<TwoslashGenericResult> {
    let request: TwoslashRemoteRequest = {
      code,
      ...(extension != null && { extension }),
      ...(twoslasherOptions != null && { options: twoslasherOptions as Record<string, unknown> }),
      ...(transport.meta != null && { meta: transport.meta }),
    }
    if (options.onRequest)
      request = await options.onRequest(request)

    const headers = new Headers({
      'content-type': TWOSLASH_REMOTE_CONTENT_TYPE,
      'accept': TWOSLASH_REMOTE_CONTENT_TYPE,
    })
    if (options.headers != null) {
      new Headers(options.headers).forEach((value, key) => {
        headers.set(key, value)
      })
    }
    if (transport.headers != null) {
      new Headers(transport.headers).forEach((value, key) => {
        headers.set(key, value)
      })
    }

    const init: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    }
    if (transport.signal != null)
      init.signal = transport.signal

    const response = await fetcher(endpoint, init)

    if (!response.ok) {
      let payload: TwoslashRemoteErrorPayload | undefined
      try {
        payload = await response.clone().json() as TwoslashRemoteErrorPayload
      }
      catch {
        // Body wasn't JSON; ignore and surface a generic error.
      }
      const message = payload?.error?.message
        ?? `twoslash-remote: ${response.status} ${response.statusText || 'request failed'}`
      throw new TwoslashRemoteError(message, { status: response.status, payload, response })
    }

    let result = await response.json() as TwoslashGenericResult
    if (options.onResponse)
      result = await options.onResponse(result)
    return result
  }

  return {
    endpoint,
    fetcher,
    run,
  }
}
