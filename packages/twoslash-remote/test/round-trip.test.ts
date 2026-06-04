import type { TwoslashGenericFunction } from 'twoslash-protocol'
import { describe, expect, it } from 'vitest'
import { createTwoslashFromRemote } from '../src/index'
import { createTwoslashRequestHandler } from '../src/server'

function inMemoryFetcher(handler: (request: Request) => Promise<Response>): typeof fetch {
  return (async (input, init) => {
    const request = new Request(input as RequestInfo | URL, init)
    return handler(request)
  }) as typeof fetch
}

const echoTwoslasher: TwoslashGenericFunction = (code, extension) => ({
  code,
  extension,
  nodes: [
    {
      type: 'hover',
      target: 'echo',
      text: `${extension ?? 'ts'}: hovered`,
      start: 0,
      length: 5,
      line: 0,
      character: 0,
    },
  ],
})

describe('round-trip', () => {
  it('serializes (code, extension) and deserializes a TwoslashGenericResult', async () => {
    const handler = createTwoslashRequestHandler({ twoslasher: echoTwoslasher })
    const twoslash = createTwoslashFromRemote({
      endpoint: 'http://twoslash.test/twoslash',
      fetcher: inMemoryFetcher(handler),
    })

    const result = await twoslash.run('hello world', 'ts')
    expect(result.code).toBe('hello world')
    expect(result.extension).toBe('ts')
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]).toMatchObject({
      type: 'hover',
      text: 'ts: hovered',
    })
  })

  it('passes twoslasher options through to the backend', async () => {
    let captured: unknown
    const handler = createTwoslashRequestHandler({
      twoslasher: (code, extension, options) => {
        captured = options
        return { code, nodes: [] }
      },
    })
    const twoslash = createTwoslashFromRemote({
      endpoint: 'http://twoslash.test/twoslash',
      fetcher: inMemoryFetcher(handler),
    })

    await twoslash.run('x', 'ts', { customTags: ['log'] })
    expect(captured).toEqual({ customTags: ['log'] })
  })

  it('forwards `meta` from transport options to the server', async () => {
    let received: Record<string, unknown> | undefined
    const handler = createTwoslashRequestHandler({
      twoslasher: code => ({ code, nodes: [] }),
      onRequest: (request) => {
        received = request.meta
        return request
      },
    })
    const twoslash = createTwoslashFromRemote({
      endpoint: 'http://twoslash.test/twoslash',
      fetcher: inMemoryFetcher(handler),
    })

    await twoslash.run('x', 'ts', undefined, { meta: { tenant: 'foo' } })
    expect(received).toEqual({ tenant: 'foo' })
  })

  it('omits `extension`, `options` and `meta` from the request when not provided', async () => {
    let receivedBody: unknown
    const handler = async (request: Request): Promise<Response> => {
      receivedBody = await request.clone().json()
      const inner = createTwoslashRequestHandler({
        twoslasher: code => ({ code, nodes: [] }),
      })
      return inner(request)
    }
    const twoslash = createTwoslashFromRemote({
      endpoint: 'http://twoslash.test/twoslash',
      fetcher: inMemoryFetcher(handler),
    })

    await twoslash.run('x')
    expect(receivedBody).toEqual({ code: 'x' })
  })

  it('invokes onRequest / onResponse hooks on the client', async () => {
    const handler = createTwoslashRequestHandler({
      twoslasher: code => ({ code, nodes: [] }),
    })
    const twoslash = createTwoslashFromRemote({
      endpoint: 'http://twoslash.test/twoslash',
      fetcher: inMemoryFetcher(handler),
      onRequest: request => ({ ...request, code: `prefix ${request.code}` }),
      onResponse: result => ({ ...result, code: `${result.code} suffix` }),
    })

    const result = await twoslash.run('hi', 'ts')
    expect(result.code).toBe('prefix hi suffix')
  })

  it('invokes onRequest / onResponse hooks on the server', async () => {
    const handler = createTwoslashRequestHandler({
      twoslasher: code => ({ code, nodes: [] }),
      onRequest: request => ({ ...request, code: `[svr-in] ${request.code}` }),
      onResponse: result => ({ ...result, code: `${result.code} [svr-out]` }),
    })
    const twoslash = createTwoslashFromRemote({
      endpoint: 'http://twoslash.test/twoslash',
      fetcher: inMemoryFetcher(handler),
    })

    const result = await twoslash.run('hi', 'ts')
    expect(result.code).toBe('[svr-in] hi [svr-out]')
  })

  it('strips non-protocol fields (like `meta` getters from core twoslash) from the wire', async () => {
    const handler = createTwoslashRequestHandler({
      twoslasher: code => ({
        code,
        nodes: [],
        // Simulate the core twoslash return shape leaking extra fields.
        meta: { compilerOptions: { strict: true } } as any,
      } as any),
    })
    const twoslash = createTwoslashFromRemote({
      endpoint: 'http://twoslash.test/twoslash',
      fetcher: inMemoryFetcher(handler),
    })

    const result = await twoslash.run('x')
    expect(Object.keys(result).sort()).toEqual(['code', 'nodes'])
  })

  it('merges instance and per-call headers, with per-call winning on conflict', async () => {
    let receivedHeaders: Headers | undefined
    const handler = async (request: Request): Promise<Response> => {
      receivedHeaders = request.headers
      const inner = createTwoslashRequestHandler({
        twoslasher: code => ({ code, nodes: [] }),
      })
      return inner(request)
    }
    const twoslash = createTwoslashFromRemote({
      endpoint: 'http://twoslash.test/twoslash',
      fetcher: inMemoryFetcher(handler),
      headers: { 'x-instance': 'A', 'x-shared': 'instance' },
    })

    await twoslash.run('x', 'ts', undefined, { headers: { 'x-call': 'B', 'x-shared': 'call' } })

    expect(receivedHeaders?.get('x-instance')).toBe('A')
    expect(receivedHeaders?.get('x-call')).toBe('B')
    expect(receivedHeaders?.get('x-shared')).toBe('call')
  })

  it('respects an AbortSignal passed via transport options', async () => {
    const controller = new AbortController()
    const handler = async (request: Request): Promise<Response> => {
      // Mirror the abort signal so the consumer can observe it.
      if (request.signal.aborted)
        return new Response(null, { status: 499 })
      return new Promise<Response>((_, reject) => {
        request.signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    }
    const twoslash = createTwoslashFromRemote({
      endpoint: 'http://twoslash.test/twoslash',
      fetcher: inMemoryFetcher(handler),
    })

    const pending = twoslash.run('x', 'ts', undefined, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
