/* eslint-disable no-console */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { Command } from 'commander'
import chokidar from 'chokidar'

import { canConvert, runOnFile } from './'

const program = new Command()

program
  .description(
    `Converts md/ts/js/tsx/jsx files into HTML by running them through Shikiji Twoslash.

Examples:    

    Converts a bunch of ts files in the samples dir and creates .html files in renders  
    
    $ twoslash samples/*.ts renders 

    Render a few markdown files to .html files in the build folder

    $ twoslash pages/one.md  pages/two.md build`,
  )
  .option('-w, --watch', 'Watch for file updates and rerun Twoslash if necessary.')
  .option('-s, --samples', 'Instead of rendering to HTML, spit out individual code blocks as files.')
  .option('--sourceAlso', 'Also include a render of the source input. Only works on ts/tsx/js/jsx files.')
  .option('--reactAlso', 'Also include a tsx file with the code embedded.')
  .option('--lint', 'Don\'t actually render output files, just verify they work.')

  .on('--help', () => {
    console.log('\n')
    console.log('  Reference:')
    console.log('    - CLI Info:')
    console.log('      https://github.com/twoslash/twoslash/tree/main/packages/twoslash-cli')
  })

program.parse(process.argv)

const options = program.opts()
if (options.debug)
  console.log(options)

const to = program.args.pop()!
if (!to)
  throw new Error('Missing output folder')

const possibleFiles = program.args
  .flatMap((from) => {
    const stat = statSync(from)
    return stat.isDirectory() ? readdirSync(from).map(p => join(from, p)) : [from]
  })
  .filter(canConvert)

if (possibleFiles.length === 0)
  throw new Error('Could not find any md/ts/js/tsx/jsx files in the input')

const s = possibleFiles.length === 1 ? '' : 's'
console.log(`Twoslashifying ${possibleFiles.length} file${s} ${options.watch ? '(watch mode)' : ''}:\n`)

function run(from: string) {
  runOnFile({
    from,
    to,
    splitOutCodeSamples: options.samples,
    alsoRenderSource: options.sourceAlso,
    lint: options.lint,
    reactAlso: options.reactAlso,
  })
}

if (options.watch)
  chokidar.watch(possibleFiles).on('all', (_, from) => run(from))

else
  possibleFiles.forEach(run)
