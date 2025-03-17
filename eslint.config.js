import antfu from '@antfu/eslint-config'

export default antfu({
  pnpm: true,

  markdown: {
    overrides: {
      'prefer-const': 'off',
      'import/first': 'off',
    },
  },

  ignores: [
    '**/test/fixtures/**/*',
    '**/test/results/**/*',
    '**/.eval*',
  ],
})
