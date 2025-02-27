import fs from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
import { format } from 'pretty-format'
import UnoCSS from 'unocss/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'

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
        return code.replace(/(`{3,4})(\w+) twoslash([^\n]*)\n([\s\S]+?)\n\1/g, (_, quotes, lang, options, code) => {
          // Only run on codeblocks which have a twoslash annotation
          if (!code.match(/\/\/ @|\^[?|^]|---cut/))
            return _

          let preferInput = false
          options = options
            .replace(/\binput\b/, () => {
              preferInput = true
              return ''
            })
            .trim()

          return [
            `<TwoslashRenderTabs${preferInput ? ' :prefer-input="true"' : ''}>`,
            '<template #rendered>',
            '',
            `${quotes}${lang} twoslash ${options} [Twoslash Rendered]`,
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
            '</TwoslashRenderTabs>',
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
          // eslint-disable-next-line regexp/no-super-linear-backtracking
          /(`{3,4})(\w+)([^\n]*?)\beval\b([^\n]*)\n([\s\S]+?)\n\1/g,
          async (_, quotes, lang, optionsPre, optionsPost, code) => {
            console.log('markdown eval', { lang, code })
            const logs: any[][] = []
            const _console = globalThis.console

            const filename = resolve(id, '..', `.eval.${new Date().getTime()}.${lang}`)
            await fs.writeFile(filename, code, 'utf-8')

            globalThis.console = {
              log: (...args: any[]) => {
                logs.push(args)
              },
              error: (...args: any[]) => {
                logs.push(args)
              },
              warn: (...args: any[]) => {
                logs.push(args)
              },
            } as any

            try {
              const jiti = createJiti(id, {
                cache: false,
              })
              await jiti.import(filename)
            }
            finally {
              globalThis.console = _console
              await fs.unlink(filename)
            }

            return [
              `${quotes}ts ${optionsPre} ${optionsPost}`,
              logs.map(args => args.map(a => format(a, {
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
