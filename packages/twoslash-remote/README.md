# twoslash-remote

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]

Run [Twoslash](https://github.com/twoslashes/twoslash) by delegating resolution to a remote HTTP API. Keep the heavy dependencies (TypeScript, type acquisition, virtual file system, Vue language server, ...) on a server and ship only a tiny client to the browser, build pipeline, or edge function.

The package exposes two entry points:

- `twoslash-remote` — a client that sends a code snippet + metadata to your endpoint and resolves the [`TwoslashGenericResult`](https://github.com/twoslashes/twoslash/blob/main/packages/twoslash-protocol/src/types/returns.ts) you get back.
- `twoslash-remote/server` — web-standard `Request → Response` helpers to implement the contract on the server side, with any backend that returns a `TwoslashGenericResult` (`twoslash`, `twoslash-eslint`, `twoslash-vue`, or your own).

## Usage

### Client

```ts
import { createTwoslashFromRemote } from 'twoslash-remote'

const twoslash = createTwoslashFromRemote({
  endpoint: 'https://my-api.example.com/twoslash',
})

const result = await twoslash.run(
  `
    const count = 1
    //    ^?
  `,
  'ts',
  // Optional: serializable twoslasher options forwarded to the backend
  { compilerOptions: { strict: true } },
  // Optional: transport-level options (meta, headers, signal)
  { meta: { tenant: 'docs-site' } },
)

console.log(result) // { code: '...', nodes: [...] }
```

The third argument is forwarded to the server backend as `options` in the request body. The fourth argument is transport-only (`meta`, `headers`, `signal`).

### Server

`createTwoslashRequestHandler` returns a web-standard `(req: Request) => Promise<Response>`. It runs in Node ≥ 18, Bun, Deno, Cloudflare Workers, Vercel/Netlify edge functions, and any framework that speaks the fetch API.

```ts
import { createTwoslasher } from 'twoslash'
import { createTwoslashRequestHandler } from 'twoslash-remote/server'

const twoslasher = createTwoslasher()

export default createTwoslashRequestHandler({
  twoslasher,
  cors: true,
})
```

Plug in any backend that returns a `TwoslashGenericResult` — `twoslash-eslint`, `twoslash-vue`, or a custom wrapper:

```ts
import { createTwoslasher as createESLintTwoslasher } from 'twoslash-eslint'
import { createTwoslashRequestHandler } from 'twoslash-remote/server'

const twoslasher = createESLintTwoslasher({ eslintConfig: [/* ... */] })

export default createTwoslashRequestHandler({ twoslasher })
```

Lower-level building blocks (`parseTwoslashRequest`, `serializeTwoslashError`) are also exported for users who want to integrate into a framework manually.

## License

[MIT](./LICENSE) License © 2024-PRESENT [Anthony Fu](https://github.com/antfu)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/twoslash-remote?style=flat&colorA=161514&colorB=EAB836
[npm-version-href]: https://npmjs.com/package/twoslash-remote
[npm-downloads-src]: https://img.shields.io/npm/dm/twoslash-remote?style=flat&colorA=161514&colorB=E66041
[npm-downloads-href]: https://npmjs.com/package/twoslash-remote
