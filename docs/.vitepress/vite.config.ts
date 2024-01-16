import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import fs from 'node:fs/promises'
import { defineConfig } from 'vite'
import UnoCSS from 'unocss/vite'
import Components from 'unplugin-vue-components/vite'
import { format } from 'pretty-format'
import JITI from 'jiti'

export default defineConfig({
  plugins: [
    Components({
      dirs: [
        fileURLToPath(new URL('./components', import.meta.url)),
      ],
      dts: fileURLToPath(new URL('../components.d.ts', import.meta.url)),
      include: [/\.vue$/, /\.vue\?vue/, /\.md$/],
      extensions: ['vue', 'md'],
    }),
    UnoCSS(
      fileURLToPath(new URL('./uno.config.ts', import.meta.url)),
    ),
    // Converting Twoslash codeblocks into code-groups with the source code
    {
      name: 'markdown-transformer',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('.md'))
          return
        return code.replace(/(`{3,4})(\w+) twoslash([^\n]*?)\n([\s\S]+?)\n\1/g, (_, quotes, lang, options, code) => {
          // Only run on codeblocks which have a twoslash annotation
          if (!code.match(/\/\/ @|\^[?\|^]|---cut/))
            return _

          return [
            '<TwoSlashRenderTabs>',
            '<template #rendered>',
            '',
            `${quotes}${lang} twoslash${options} [Twoslash Rendered]`,
            code,
            quotes,
            '',
            '</template>',
            '<template #source>',
            '',
            `${quotes}${lang} ${options} [Input Code]`,
            code,
            quotes,
            '',
            '</template>',
            '</TwoSlashRenderTabs>',
          ].join('\n')
        })
      },
    },
    {
      name: 'markdown-eval',
      enforce: 'pre',
      async transform(code, id) {
        if (!id.endsWith('.md'))
          return
        return await replaceAsync(
          code,
          /(`{3,4})(\w+)([^\n]*?)\beval\b([^\n]*?)\n([\s\S]+?)\n\1/g,
          async (_, quotes, lang, optionsPre, optionsPost, code) => {
            // eslint-disable-next-line no-console
            console.log('markdown eval', { lang, code })
            const logos = []
            const _console = globalThis.console

            const filename = resolve(id, '..', `.eval.${new Date().getTime()}.${lang}`)
            await fs.writeFile(filename, code, 'utf-8')

            globalThis.console = {
              log: (...args: any[]) => {
                logos.push(args)
              },
              error: (...args: any[]) => {
                logos.push(args)
              },
              warn: (...args: any[]) => {
                logos.push(args)
              },
            } as any

            try {
              const jiti = JITI(id, {
                esmResolve: true,
                cache: false,
              })
              await jiti(filename)
            }
            finally {
              globalThis.console = _console
              await fs.unlink(filename)
            }

            return [
              `${quotes}ts ${optionsPre} ${optionsPost}`,
              logos.map(args => args.map(a => format(a, {
                printBasicPrototype: false,
                printFunctionName: false,
              })).join(' ')).join('\n'),
              quotes,
            ].join('\n')
          },
        )
      },
    },
  ],
})

function replaceAsync(str: string, regex: RegExp, asyncFn: (match: string, ...args: any[]) => Promise<string>) {
  const promises: Promise<string>[] = []
  str.replace(regex, (match, ...args) => {
    promises.push(asyncFn(match, ...args))
    return match
  })
  return Promise.all(promises).then((replacements) => {
    return str.replace(regex, () => replacements.shift()!)
  })
}
