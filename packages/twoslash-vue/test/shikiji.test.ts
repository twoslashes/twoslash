import { expect, it } from 'vitest'
import { codeToHtml } from 'shikiji'
import { createTransformerFactory, rendererRich } from 'shikiji-twoslash/core'
import { createTwoslasher } from '../src'

const code = await import('./fixtures/example.vue?raw').then(m => m.default)

const styleHeader = [
  '<head>',
  `<link rel="stylesheet" href="https://esm.sh/shikiji-twoslash@0.9.18/style-rich.css" />`,
  `<style>:root { color-scheme: dark; --twoslash-popup-bg: #222; }</style>`,
  '</head>',
  '',
].join('\n')

const twoslasherVue = createTwoslasher()

it('highlight vue', async () => {
  const result = await codeToHtml(code, {
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

  expect(styleHeader + result)
    .toMatchFileSnapshot('./results/renderer/example.vue.html')
})

const twoslasherRaw = createTwoslasher({
  debugShowGeneratedCode: true,
})

it('highlight raw', async () => {
  const result = await codeToHtml(code, {
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

  expect(styleHeader + result)
    .toMatchFileSnapshot('./results/renderer/example.raw.html')
})
