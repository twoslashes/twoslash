import type { TwoslashGenericResult } from 'twoslash-protocol'
import type { Plugin } from 'vite'
import { Buffer } from 'node:buffer'
import { Worker } from 'node:worker_threads'
import { createTwoslashRequestHandler } from 'twoslash-remote/server'
import { defineConfig } from 'vite'

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

interface WorkerMessage {
  id: number
  result?: unknown
  error?: { name: string, message: string, stack?: string }
}

function twoslashRemoteDevPlugin(): Plugin {
  let worker: Worker | undefined
  let nextId = 1
  const pending = new Map<number, PendingCall>()

  function ensureWorker(): Worker {
    if (worker)
      return worker
    const workerUrl = new URL('./twoslash-worker.mjs', import.meta.url)
    const w = new Worker(workerUrl)

    w.on('message', (message: WorkerMessage) => {
      const handler = pending.get(message.id)
      if (!handler)
        return
      pending.delete(message.id)
      if (message.error) {
        const err = new Error(message.error.message)
        err.name = message.error.name
        if (message.error.stack)
          err.stack = message.error.stack
        handler.reject(err)
      }
      else {
        handler.resolve(message.result)
      }
    })

    w.on('error', (err) => {
      console.error('[twoslash-remote-dev] worker error:', err)
      for (const { reject } of pending.values())
        reject(err)
      pending.clear()
      worker = undefined
    })

    w.on('exit', (code) => {
      if (code !== 0)
        console.warn(`[twoslash-remote-dev] worker exited with code ${code}`)
      for (const { reject } of pending.values())
        reject(new Error(`twoslash-remote worker exited with code ${code}`))
      pending.clear()
      worker = undefined
    })

    worker = w
    return w
  }

  function callWorker(payload: {
    code: string
    extension?: string
    options?: unknown
  }): Promise<unknown> {
    const w = ensureWorker()
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      w.postMessage({ id, ...payload })
    })
  }

  const handler = createTwoslashRequestHandler({
    twoslasher: async (code, extension, options) => {
      const result = await callWorker({ code, extension, options })
      return result as TwoslashGenericResult
    },
    exposeErrorStack: true,
  })

  return {
    name: 'twoslash-remote-dev',
    configureServer(server) {
      // Spawn the worker eagerly so the first request doesn't pay startup cost.
      ensureWorker()

      server.middlewares.use('/twoslash', async (req, res) => {
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req)
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          const body = Buffer.concat(chunks)

          const host = req.headers.host ?? 'localhost'
          const url = `http://${host}${req.originalUrl ?? req.url ?? '/'}`

          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers)) {
            if (value == null)
              continue
            headers.set(key, Array.isArray(value) ? value.join(', ') : String(value))
          }

          const method = req.method ?? 'GET'
          const webReq = new Request(url, {
            method,
            headers,
            body: method === 'GET' || method === 'HEAD' ? undefined : body,
          })

          const webRes = await handler(webReq)
          res.statusCode = webRes.status
          webRes.headers.forEach((value, key) => {
            res.setHeader(key, value)
          })
          res.end(Buffer.from(await webRes.arrayBuffer()))
        }
        catch (err) {
          console.error('[twoslash-remote-dev] middleware error:', err)
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({
            error: {
              name: 'InternalError',
              message: err instanceof Error ? err.message : String(err),
            },
          }))
        }
      })

      const shutdown = () => {
        if (worker) {
          worker.terminate().catch(() => {})
          worker = undefined
        }
      }
      server.httpServer?.on('close', shutdown)
    },
    closeBundle() {
      if (worker) {
        worker.terminate().catch(() => {})
        worker = undefined
      }
    },
  }
}

export default defineConfig({
  plugins: [twoslashRemoteDevPlugin()],
  server: {
    // Workbench host config — see workspace AGENTS.md
    host: '0.0.0.0',
  },
})
