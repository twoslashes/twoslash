/* eslint-disable antfu/no-top-level-await */
import type { TwoslashGenericFunction, TwoslashGenericResult } from 'twoslash-protocol'
import { createTransformerFactory, rendererRich } from '@shikijs/twoslash/core'
import { codeToHtml } from 'shiki'
import { createTwoslashFromRemote } from 'twoslash-remote'

import '@shikijs/twoslash/style-rich.css'

interface Snippet {
  title: string
  code: string
  lang: string
}

const snippets: Snippet[] = [
  {
    title: 'Auto Type Acquisition (Vue, fetched from CDN)',
    lang: 'ts',
    code: `// @errors: 2540
import { computed, ref } from 'vue'

const count = ref(0)
//    ^?

const doubled = computed(() => count.value * 2)
//    ^?

doubled.value = 10
`,
  },
  {
    title: 'Pure TypeScript (warm cache)',
    lang: 'ts',
    code: `type Greeting<T extends string> = \`Hello, \${T}!\`

type Hi = Greeting<'world'>
//   ^?

const greet: Hi = 'Hello, world!'
//    ^?
`,
  },
]

const twoslash = createTwoslashFromRemote({
  endpoint: '/twoslash',
})

const app = document.getElementById('app')
if (!app)
  throw new Error('#app element is missing from index.html')

app.innerHTML = `<p class="meta">Resolving ${snippets.length} snippets via <code>POST /twoslash</code>… the first request pays for type acquisition from CDN, subsequent ones hit the worker's warm cache.</p>`

try {
  const startedAt = performance.now()

  // Pre-resolve every snippet over the wire. The Shiki transformer below is
  // sync, so we cache the results and hand them back synchronously when
  // codeToHtml invokes the transformer.
  const resolved = await Promise.all(
    snippets.map(async (snippet) => {
      const result = await twoslash.run(snippet.code, snippet.lang)
      return [snippet.code, result] as const
    }),
  )
  const elapsedMs = Math.round(performance.now() - startedAt)
  const cache = new Map<string, TwoslashGenericResult>(resolved)

  const syncTwoslasher: TwoslashGenericFunction = (code) => {
    const cached = cache.get(code)
    if (!cached)
      throw new Error('twoslash-remote: code was not pre-resolved')
    return cached
  }

  const transformer = createTransformerFactory(syncTwoslasher)({
    renderer: rendererRich(),
  })

  const sections = await Promise.all(
    snippets.map(async (snippet) => {
      const html = await codeToHtml(snippet.code, {
        lang: snippet.lang,
        theme: 'vitesse-dark',
        transformers: [transformer],
      })
      return `<section><h3>${escapeHtml(snippet.title)}</h3>${html}</section>`
    }),
  )

  app.innerHTML = `
    <p class="meta">Resolved ${snippets.length} snippets in ${elapsedMs}ms.</p>
    ${sections.join('\n')}
  `
}
catch (err) {
  console.error(err)
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  app.innerHTML = `<div class="error">${escapeHtml(message)}</div>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
