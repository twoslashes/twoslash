import { createTransformerFactory, rendererRich } from '@shikijs/twoslash/core'
import { createHighlighter } from 'shiki'
import { expect, it } from 'vitest'
import { createTwoslasher } from '../src'

const isWindows = process.platform === 'win32'

const code = await import('./fixtures/example.vue?raw').then(m => m.default)

const styleHeader = [
  '<head>',
  `<link rel="stylesheet" href="https://esm.sh/@shikijs/twoslash@1.0.0-beta.5/style-rich.css" />`,
  `<style>:root { color-scheme: dark; --twoslash-popup-bg: #222; }</style>`,
  '</head>',
  '',
].join('\n')

const twoslasherVue = createTwoslasher()
const shiki = await createHighlighter({
  themes: [
    'vitesse-dark',
  ],
  langs: [
    'vue',
    'ts',
    'tsx',
    'vue',
  ],
})

it('highlight vue', async () => {
  const result = await shiki.codeToHtml(code, {
    lang: 'vue',
    theme: 'vitesse-dark',
    transformers: [
      createTransformerFactory(twoslasherVue)({
        langs: ['ts', 'tsx', 'vue'],
        renderer: rendererRich({
          lang: 'ts',
        }),
      }),
    ],
  })

  await expect(styleHeader + result)
    .toMatchFileSnapshot('./results/renderer/example.vue.html')
})

const twoslasherRaw = createTwoslasher({
  debugShowGeneratedCode: true,
})

it.skipIf(isWindows)('highlight raw', async () => {
  const result = await shiki.codeToHtml(code, {
    lang: 'vue',
    theme: 'vitesse-dark',
    transformers: [
      createTransformerFactory(twoslasherRaw)({
        langs: ['ts', 'tsx', 'vue'],
        renderer: rendererRich({
          lang: 'ts',
        }),
      }),
    ],
  })

  await expect(styleHeader + result)
    .toMatchFileSnapshot('./results/renderer/example.raw.html')
})
