import type { TwoslashGenericResult } from 'twoslash-protocol'

/**
 * Wire-format of an incoming twoslash request.
 *
 * Sent as `application/json` in the body of a `POST` request to the endpoint.
 */
export interface TwoslashRemoteRequest {
  /**
   * The source code to run twoslash on.
   */
  code: string

  /**
   * Optional file extension / language hint (e.g. `'ts'`, `'tsx'`, `'vue'`).
   * Same semantics as the second argument of `TwoslashGenericFunction`.
   */
  extension?: string

  /**
   * Serializable subset of the underlying twoslasher's options.
   *
   * For the core `twoslash` package this typically includes `compilerOptions`,
   * `handbookOptions`, `customTags` and `extraFiles`. Non-JSON-serializable
   * values (functions, `Map`s, etc.) are not supported on the wire — apply
   * those on the server side when constructing the twoslasher instance.
   */
  options?: Record<string, unknown>

  /**
   * Free-form metadata propagated to the server. The shape is whatever the
   * server backend chooses to consume (tenant id, language tag, theme, ...).
   * The transport itself does not inspect this field.
   */
  meta?: Record<string, unknown>
}

/**
 * Wire-format of an error response. Returned with HTTP status `>= 400`.
 */
export interface TwoslashRemoteErrorPayload {
  error: {
    /** Error class name, e.g. `'TwoslashError'`, `'TypeError'`. */
    name: string
    /** Human-readable error message. */
    message: string
    /** Only present when the server is configured with `exposeErrorStack`. */
    stack?: string
    /** Optional, backend-defined error code (e.g. TS error code). */
    code?: number | string
  }
}

/**
 * Content-Type used for requests and responses on the wire.
 */
export const TWOSLASH_REMOTE_CONTENT_TYPE = 'application/json'

/**
 * Re-exported for convenience so consumers only need to import from
 * `twoslash-remote` or `twoslash-remote/server` to get the canonical
 * result shape that flows across the wire.
 */
export type { TwoslashGenericResult }
