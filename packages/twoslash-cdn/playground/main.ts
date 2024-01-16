import 'shikiji-twoslash/style-rich.css'
import { createTransformerFactory, rendererRich } from 'shikiji-twoslash/core'
import { codeToHtml } from 'shikiji'
import { createStorage } from 'unstorage'
import indexedDbDriver from 'unstorage/drivers/indexedb'
import { createTwoslashFromCDN } from 'twoslash-cdn'

const storage = createStorage({
  driver: indexedDbDriver({ base: 'twoslash-cdn:' }),
})

const twoslash = createTwoslashFromCDN({
  storage,
  compilerOptions: {
    lib: ['esnext', 'dom'],
  },
})

const source = `
import { ref } from 'vue'

console.log("Hi! Shiki on CDN :)")

const count = ref(0)
//     ^?
`

await twoslash.prepareTypes(source)

const app = document.getElementById('app')!
app.innerHTML = await codeToHtml(source, {
  lang: 'ts',
  theme: 'vitesse-dark',
  transformers: [
    createTransformerFactory(twoslash.runSync)({
      renderer: rendererRich(),
    }),
  ],
})
