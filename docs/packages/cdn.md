# Twoslash CDN

Run Twoslash on the browsers or web workers, with [Auto-Type-Acquisition](https://www.typescriptlang.org/play#example/automatic-type-acquisition) from CDN.

A thin wrapper around `twoslash`, `@typescript/vfs`, `@typescript/ata` to an easy-to-use interface. Huge thanks to the TypeScript team for the heavy-lifting work on the [TypeScript Website](https://github.com/microsoft/TypeScript-Website) project.

[CDN Example](https://twoslash-cdn-examples.netlify.app/) | [Example Source File](https://github.com/antfu/twoslashes/blob/main/packages/twoslash-cdn/examples/index.html)

## Usage

```html
<script type="module">
  // Replace with exact version in production:
  import { createTwoslashFromCDN } from 'https://esm.sh/twoslash-cdn@latest'

  const twoslash = createTwoslashFromCDN()

  // During `.run()`, it will automatically fetch types from CDN
  // for used imports in the code (in this case, `vue` and its dependencies),
  // and then resolve the types with TypeScript running on the browser.
  const result = await twoslash.run(`
    import { ref } from 'vue'
    const count = ref(0)
    //     ^?
  `)

  console.log(result) // { code: '...', nodes: [...] }
</script>
```

Or to bundle it your own,

```bash
npm i -D twoslash-cdn
```

```ts twoslash
import { createTwoslashFromCDN } from 'twoslash-cdn'

const twoslash = createTwoslashFromCDN()
// ...
```

### Cache Persistence

By default, the fetched files are stored in a virtual file system in memory so that multiple runs can share the same cache. If you want to keep them persistent, you can pass a `storage` option to the factory. The storage supports [unstorage](https://github.com/unjs/unstorage)'s interface, where you can adopt the storage to any supported providers.

```html
<script type="module">
  // Replace with exact versions in production:
  import { createTwoslashFromCDN } from 'https://esm.sh/twoslash-cdn@latest'
  import { createStorage } from 'https://esm.sh/unstorage@latest'
  import indexedDbDriver from 'https://esm.sh/unstorage@latest/drivers/indexedb'

  // An example of using unstorage with IndexedDB to cache the virtual file system.
  const storage = createStorage({
    driver: indexedDbDriver(),
  })

  const twoslash = createTwoslashFromCDN({
    storage,
  })

  const result = await twoslash.run(`const foo = 1`)
</script>
```

Refresh the page after loading once, you will see the execution is much faster as the cache is loaded from the local IndexedDB.

### Synchronize Usage

Fetching files from CDN is asynchronous, and there is no way to make the whole process synchronous. But if you can run some asynchronous code beforehand, we do provide API to separate the asynchronous part and the synchronous part.

For example, in [Shikiji](https://shikiji.netlify.app/), the `codeToHtml` function is synchronous as well as the [`shikiji-twoslash` transformer](https://shikiji.netlify.app/packages/twoslash).

```ts
import { createTwoslashFromCDN } from 'twoslash-cdn'
import { createHighlighter } from 'shikiji'
import { transformerTwoslash } from 'shikiji-twoslash'

const highlighter = await createHighlighter({})

const twoslash = createTwoslashFromCDN()

const code = `
import { ref } from 'vue'
const foo = ref(1)
//    ^?
`

// Load all necessary types from CDN before hand.
await twoslash.prepreTypes(code)

// This can be done synchronously.
const highlighted = highlighter.codeToHtml(code, {
  lang: 'ts',
  theme: 'dark-plus',
  transformers: [
    transformerTwoslash({
      // Use `twoslash.runSync` to replace the non-CDN `twoslasher` function.
      twoslasher: twoslash.runSync
    })
  ],
})
```
