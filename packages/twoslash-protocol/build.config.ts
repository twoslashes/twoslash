import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/types',
  ],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
  },
})
