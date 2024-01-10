import antfu from '@antfu/eslint-config'

export default antfu({
  stylistic: false,
  ignores: [
    'test/fixtures/**/*',
    'test/results/**/*',
  ]
})
