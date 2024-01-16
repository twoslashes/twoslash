import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    '**/test/fixtures/**/*',
    '**/test/results/**/*',
    '**/.eval*',
  ],
  markdown: {
    overrides: {
      'prefer-const': 'off',
      'import/first': 'off',
    },
  },
})
