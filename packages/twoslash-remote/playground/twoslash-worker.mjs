// Node worker_threads entry. Loaded by `vite.config.ts` when the dev server
// starts. Runs `twoslash-cdn` in isolation so that the (slow, CPU-bound)
// type acquisition and TypeScript compilation never block Vite's main loop.
//
// Protocol with the parent thread:
//   parent → worker  { id, code, extension, options }
//   worker → parent  { id, result } | { id, error }

import { parentPort } from 'node:worker_threads'
import { createTwoslashFromCDN } from 'twoslash-cdn'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'

if (!parentPort)
  throw new Error('twoslash-worker.mjs must be loaded as a worker_thread')

// Persist the CDN cache across dev-server restarts so subsequent boots are fast.
const storage = createStorage({
  driver: fsDriver({ base: '.cache/twoslash-cdn' }),
})

const twoslash = createTwoslashFromCDN({
  storage,
  compilerOptions: {
    lib: ['esnext', 'dom'],
  },
})

parentPort.on('message', async (message) => {
  const { id, code, extension, options } = message
  try {
    const result = await twoslash.run(code, extension, options)
    parentPort.postMessage({
      id,
      result: {
        code: result.code,
        extension: result.extension,
        nodes: result.nodes,
      },
    })
  }
  catch (err) {
    parentPort.postMessage({
      id,
      error: {
        name: err?.name ?? 'Error',
        message: err?.message ?? String(err),
        stack: err?.stack,
      },
    })
  }
})
