import type { TwoslashGenericResult } from 'twoslash-protocol'
import type { TwoslashRemoteErrorPayload, TwoslashRemoteRequest } from './shared'
import { TWOSLASH_REMOTE_CONTENT_TYPE } from './shared'

export * from './shared'

/**
 * Server-side backend signature.
 *
 * Any function with this shape can fulfil a twoslash-remote request: the
 * core `twoslasher` from the `twoslash` package, `createTwoslasher` from
 * `twoslash-eslint`, `twoslash-vue`, or a custom wrapper that returns a
 * `TwoslashGenericResult` either synchronously or as a `Promise`.
 *
 * `options` is intentionally typed loosely (`any`) because the wire format
 * is opaque to the transport — each backend defines its own option shape.
 */
export type TwoslashRemoteBackend = (
  code: string,
  extension?: string,
  options?: any,
) => TwoslashGenericResult | Promise<TwoslashGenericResult>

export interface CreateTwoslashRequestHandlerOptions {
  /**
   * The underlying twoslasher. Anything that takes `(code, extension, options)`
   * and returns a `TwoslashGenericResult` (sync or async) works.
   */
  twoslasher: TwoslashRemoteBackend

  /**
   * If `true`, enable permissive CORS (`Access-Control-Allow-Origin: *`).
   * If an object, allow only the listed origin(s). Defaults to `false`.
   */
  cors?: boolean | { origin: string | string[] }

  /**
   * Maximum request body size in bytes. Larger payloads get rejected with
   * HTTP 413. Defaults to 1 MiB.
   */
  maxBodyBytes?: number

  /**
   * Transform / validate the parsed request before invoking the twoslasher.
   * Throw to short-circuit with HTTP 400.
   */
  onRequest?: (request: TwoslashRemoteRequest) => TwoslashRemoteRequest | Promise<TwoslashRemoteRequest>

  /**
   * Transform the result before it's serialized back to the client.
   */
  onResponse?: (
    result: TwoslashGenericResult,
    request: TwoslashRemoteRequest,
  ) => TwoslashGenericResult | Promise<TwoslashGenericResult>

  /**
   * If `true`, include `stack` traces in error responses. Defaults to `false`
   * to avoid leaking server internals in production.
   */
  exposeErrorStack?: boolean
}

const DEFAULT_MAX_BYTES = 1024 * 1024 // 1 MiB

/**
 * Parse and validate a raw JSON value as a `TwoslashRemoteRequest`.
 * Throws `SyntaxError` (HTTP 400) with a descriptive message on invalid input.
 */
export function parseTwoslashRequest(body: unknown): TwoslashRemoteRequest {
  if (body == null || typeof body !== 'object' || Array.isArray(body))
    throw new SyntaxError('twoslash-remote: request body must be a JSON object')

  const obj = body as Partial<TwoslashRemoteRequest>
  if (typeof obj.code !== 'string')
    throw new SyntaxError('twoslash-remote: request body is missing required string field `code`')
  if (obj.extension !== undefined && typeof obj.extension !== 'string')
    throw new SyntaxError('twoslash-remote: `extension` must be a string when present')
  if (obj.options !== undefined && (typeof obj.options !== 'object' || obj.options === null || Array.isArray(obj.options)))
    throw new SyntaxError('twoslash-remote: `options` must be an object when present')
  if (obj.meta !== undefined && (typeof obj.meta !== 'object' || obj.meta === null || Array.isArray(obj.meta)))
    throw new SyntaxError('twoslash-remote: `meta` must be an object when present')

  return {
    code: obj.code,
    ...(obj.extension !== undefined && { extension: obj.extension }),
    ...(obj.options !== undefined && { options: obj.options as Record<string, unknown> }),
    ...(obj.meta !== undefined && { meta: obj.meta as Record<string, unknown> }),
  }
}

/**
 * Serialize a thrown value into the wire error payload.
 */
export function serializeTwoslashError(
  err: unknown,
  options: { exposeStack?: boolean } = {},
): TwoslashRemoteErrorPayload {
  if (err instanceof Error) {
    const payload: TwoslashRemoteErrorPayload = {
      error: {
        name: err.name || 'Error',
        message: err.message,
      },
    }
    if (options.exposeStack && err.stack)
      payload.error.stack = err.stack
    const code = (err as any).code
    if (code != null && (typeof code === 'string' || typeof code === 'number'))
      payload.error.code = code
    return payload
  }
  return {
    error: {
      name: 'Error',
      message: typeof err === 'string' ? err : 'Unknown error',
    },
  }
}

/**
 * Normalize a backend result to a wire-safe `TwoslashGenericResult`.
 * Strips off any extra fields (like `meta` getters from the core twoslasher)
 * so the JSON payload only contains the documented protocol fields.
 */
function toWireResult(result: TwoslashGenericResult): TwoslashGenericResult {
  const wire: TwoslashGenericResult = {
    code: result.code,
    nodes: result.nodes,
  }
  if (result.extension != null)
    wire.extension = result.extension
  return wire
}

/**
 * Build a web-standard `Request → Response` handler that fulfils the
 * twoslash-remote protocol. Works in Node ≥ 18, Bun, Deno, Cloudflare
 * Workers, and any framework that speaks the fetch API.
 */
export function createTwoslashRequestHandler(
  options: CreateTwoslashRequestHandlerOptions,
): (request: Request) => Promise<Response> {
  if (typeof options.twoslasher !== 'function')
    throw new TypeError('twoslash-remote/server: `twoslasher` is required and must be a function')

  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BYTES

  function makeCorsHeaders(request: Request): Headers {
    const headers = new Headers()
    if (!options.cors)
      return headers
    let allow = '*'
    if (options.cors !== true) {
      const origins = Array.isArray(options.cors.origin)
        ? options.cors.origin
        : [options.cors.origin]
      const requestOrigin = request.headers.get('origin') ?? ''
      allow = origins.includes(requestOrigin) ? requestOrigin : ''
    }
    if (allow) {
      headers.set('access-control-allow-origin', allow)
      headers.set('vary', 'Origin')
    }
    headers.set('access-control-allow-methods', 'POST, OPTIONS')
    headers.set('access-control-allow-headers', 'content-type')
    return headers
  }

  function jsonResponse(body: unknown, status: number, request: Request): Response {
    const headers = makeCorsHeaders(request)
    headers.set('content-type', TWOSLASH_REMOTE_CONTENT_TYPE)
    return new Response(JSON.stringify(body), { status, headers })
  }

  function errorResponse(status: number, err: unknown, request: Request): Response {
    const payload = serializeTwoslashError(err, { exposeStack: options.exposeErrorStack })
    return jsonResponse(payload, status, request)
  }

  return async function handler(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS' && options.cors) {
      const headers = makeCorsHeaders(request)
      return new Response(null, { status: 204, headers })
    }

    if (request.method !== 'POST') {
      return errorResponse(
        405,
        new Error(`twoslash-remote: method ${request.method} not allowed`),
        request,
      )
    }

    const contentLengthHeader = request.headers.get('content-length')
    if (contentLengthHeader != null) {
      const contentLength = Number(contentLengthHeader)
      if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
        return errorResponse(
          413,
          new Error(`twoslash-remote: payload exceeds maxBodyBytes (${maxBodyBytes})`),
          request,
        )
      }
    }

    let buffer: ArrayBuffer
    try {
      buffer = await request.arrayBuffer()
    }
    catch (err) {
      return errorResponse(400, err, request)
    }
    if (buffer.byteLength > maxBodyBytes) {
      return errorResponse(
        413,
        new Error(`twoslash-remote: payload exceeds maxBodyBytes (${maxBodyBytes})`),
        request,
      )
    }

    const raw = new TextDecoder().decode(buffer)
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    }
    catch (err) {
      return errorResponse(400, err, request)
    }

    let twoslashRequest: TwoslashRemoteRequest
    try {
      twoslashRequest = parseTwoslashRequest(parsed)
    }
    catch (err) {
      return errorResponse(400, err, request)
    }

    if (options.onRequest) {
      try {
        twoslashRequest = await options.onRequest(twoslashRequest)
      }
      catch (err) {
        return errorResponse(400, err, request)
      }
    }

    let result: TwoslashGenericResult
    try {
      result = await options.twoslasher(
        twoslashRequest.code,
        twoslashRequest.extension,
        twoslashRequest.options,
      )
    }
    catch (err) {
      return errorResponse(500, err, request)
    }

    if (options.onResponse) {
      try {
        result = await options.onResponse(result, twoslashRequest)
      }
      catch (err) {
        return errorResponse(500, err, request)
      }
    }

    return jsonResponse(toWireResult(result), 200, request)
  }
}
