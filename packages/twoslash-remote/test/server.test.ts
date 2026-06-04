import { describe, expect, it } from 'vitest'
import { createTwoslashFromRemote } from '../src/index'
import {
  createTwoslashRequestHandler,
  parseTwoslashRequest,
  serializeTwoslashError,
} from '../src/server'

function inMemoryFetcher(handler: (request: Request) => Promise<Response>): typeof fetch {
  return (async (input, init) => {
    const request = new Request(input as RequestInfo | URL, init)
    return handler(request)
  }) as typeof fetch
}

function jsonPost(body: unknown): Request {
  return new Request('http://twoslash.test/twoslash', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('parseTwoslashRequest', () => {
  it('accepts a minimal { code } body', () => {
    expect(parseTwoslashRequest({ code: 'x' })).toEqual({ code: 'x' })
  })

  it('passes through optional fields', () => {
    expect(parseTwoslashRequest({
      code: 'x',
      extension: 'ts',
      options: { strict: true },
      meta: { tenant: 'foo' },
    })).toEqual({
      code: 'x',
      extension: 'ts',
      options: { strict: true },
      meta: { tenant: 'foo' },
    })
  })

  it('rejects non-objects', () => {
    expect(() => parseTwoslashRequest(null)).toThrow(/JSON object/)
    expect(() => parseTwoslashRequest(42)).toThrow()
    expect(() => parseTwoslashRequest('str')).toThrow()
    expect(() => parseTwoslashRequest([])).toThrow()
  })

  it('rejects missing or non-string `code`', () => {
    expect(() => parseTwoslashRequest({})).toThrow(/code/)
    expect(() => parseTwoslashRequest({ code: 42 })).toThrow(/code/)
  })

  it('rejects wrong types for optional fields', () => {
    expect(() => parseTwoslashRequest({ code: 'x', extension: 42 })).toThrow(/extension/)
    expect(() => parseTwoslashRequest({ code: 'x', options: 'no' })).toThrow(/options/)
    expect(() => parseTwoslashRequest({ code: 'x', options: [] })).toThrow(/options/)
    expect(() => parseTwoslashRequest({ code: 'x', meta: 'no' })).toThrow(/meta/)
    expect(() => parseTwoslashRequest({ code: 'x', meta: [] })).toThrow(/meta/)
  })
})

describe('serializeTwoslashError', () => {
  it('serializes Error instances', () => {
    const err = new Error('boom')
    expect(serializeTwoslashError(err)).toEqual({
      error: { name: 'Error', message: 'boom' },
    })
  })

  it('includes stack when exposeStack is true', () => {
    const err = new Error('boom')
    const out = serializeTwoslashError(err, { exposeStack: true })
    expect(out.error.stack).toBeTypeOf('string')
  })

  it('omits stack by default', () => {
    const err = new Error('boom')
    const out = serializeTwoslashError(err)
    expect(out.error.stack).toBeUndefined()
  })

  it('includes string or numeric `code` when present on the error', () => {
    const err = Object.assign(new Error('boom'), { code: 2322 })
    expect(serializeTwoslashError(err).error.code).toBe(2322)
    const err2 = Object.assign(new Error('boom'), { code: 'EBOOM' })
    expect(serializeTwoslashError(err2).error.code).toBe('EBOOM')
  })

  it('handles non-Error thrown values', () => {
    expect(serializeTwoslashError('plain string')).toEqual({
      error: { name: 'Error', message: 'plain string' },
    })
    expect(serializeTwoslashError(null)).toEqual({
      error: { name: 'Error', message: 'Unknown error' },
    })
  })

  it('preserves custom error class names', () => {
    class MyErr extends Error {
      override readonly name = 'MyErr'
    }
    expect(serializeTwoslashError(new MyErr('nope'))).toEqual({
      error: { name: 'MyErr', message: 'nope' },
    })
  })
})

describe('createTwoslashRequestHandler', () => {
  it('rejects non-POST with 405', async () => {
    const handler = createTwoslashRequestHandler({ twoslasher: () => ({ code: '', nodes: [] }) })
    const res = await handler(new Request('http://x/twoslash', { method: 'GET' }))
    expect(res.status).toBe(405)
    const body = await res.json()
    expect(body.error.message).toMatch(/method GET not allowed/)
  })

  it('returns 400 on invalid JSON', async () => {
    const handler = createTwoslashRequestHandler({ twoslasher: () => ({ code: '', nodes: [] }) })
    const res = await handler(jsonPost('not json'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when code is missing', async () => {
    const handler = createTwoslashRequestHandler({ twoslasher: () => ({ code: '', nodes: [] }) })
    const res = await handler(jsonPost({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toMatch(/code/)
  })

  it('returns 500 when the backend throws, with the message in the body', async () => {
    const handler = createTwoslashRequestHandler({
      twoslasher: () => {
        throw new Error('backend exploded')
      },
    })
    const res = await handler(jsonPost({ code: 'x' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.message).toBe('backend exploded')
  })

  it('the client surfaces server errors as TwoslashRemoteError', async () => {
    const handler = createTwoslashRequestHandler({
      twoslasher: () => {
        throw new Error('backend exploded')
      },
    })
    const twoslash = createTwoslashFromRemote({
      endpoint: 'http://x/twoslash',
      fetcher: inMemoryFetcher(handler),
    })
    await expect(twoslash.run('x')).rejects.toMatchObject({
      name: 'TwoslashRemoteError',
      status: 500,
      payload: { error: { message: 'backend exploded' } },
    })
  })

  it('rejects oversized payloads with 413 (via Content-Length)', async () => {
    const handler = createTwoslashRequestHandler({
      twoslasher: () => ({ code: '', nodes: [] }),
      maxBodyBytes: 16,
    })
    const big = JSON.stringify({ code: 'x'.repeat(200) })
    const res = await handler(new Request('http://x/twoslash', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(big.length) },
      body: big,
    }))
    expect(res.status).toBe(413)
  })

  it('rejects oversized payloads with 413 (post-read byte check)', async () => {
    const handler = createTwoslashRequestHandler({
      twoslasher: () => ({ code: '', nodes: [] }),
      maxBodyBytes: 16,
    })
    const big = JSON.stringify({ code: 'x'.repeat(200) })
    const res = await handler(new Request('http://x/twoslash', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: big,
    }))
    expect(res.status).toBe(413)
  })

  it('returns CORS preflight when cors is true', async () => {
    const handler = createTwoslashRequestHandler({
      twoslasher: () => ({ code: '', nodes: [] }),
      cors: true,
    })
    const res = await handler(new Request('http://x/twoslash', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-methods')).toMatch(/POST/)
  })

  it('returns 405 for OPTIONS when cors is disabled', async () => {
    const handler = createTwoslashRequestHandler({ twoslasher: () => ({ code: '', nodes: [] }) })
    const res = await handler(new Request('http://x/twoslash', { method: 'OPTIONS' }))
    expect(res.status).toBe(405)
  })

  it('restricts CORS to specific origins', async () => {
    const handler = createTwoslashRequestHandler({
      twoslasher: () => ({ code: '', nodes: [] }),
      cors: { origin: 'https://allowed.example' },
    })

    const allowed = await handler(new Request('http://x/twoslash', {
      method: 'OPTIONS',
      headers: { origin: 'https://allowed.example' },
    }))
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://allowed.example')

    const denied = await handler(new Request('http://x/twoslash', {
      method: 'OPTIONS',
      headers: { origin: 'https://other.example' },
    }))
    expect(denied.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('exposes stack traces only when exposeErrorStack is true', async () => {
    const withStack = createTwoslashRequestHandler({
      twoslasher: () => {
        throw new Error('boom')
      },
      exposeErrorStack: true,
    })
    const withoutStack = createTwoslashRequestHandler({
      twoslasher: () => {
        throw new Error('boom')
      },
    })

    const a = await (await withStack(jsonPost({ code: 'x' }))).json()
    const b = await (await withoutStack(jsonPost({ code: 'x' }))).json()

    expect(a.error.stack).toBeTypeOf('string')
    expect(b.error.stack).toBeUndefined()
  })

  it('throws synchronously when constructed without a twoslasher', () => {
    expect(() => createTwoslashRequestHandler({
      twoslasher: undefined as any,
    })).toThrow(/twoslasher/)
  })

  it('client throws synchronously without an endpoint', () => {
    expect(() => createTwoslashFromRemote({
      endpoint: undefined as any,
    })).toThrow(/endpoint/)
  })
})
