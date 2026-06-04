import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/server',
  ],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
  },
})
