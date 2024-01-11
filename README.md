# TwoSlash<sup>es</sup>

A fork and rewrite of [@typescript/twoslash](https://github.com/microsoft/TypeScript-Website/tree/v2/packages/ts-twoslasher), with improvements:

- More efficient, less memory usage (need to benchmark)
- Unified tokens information interface, easier to work with
- ESM-first, dual CJS/ESM builds
- `createTwoslasher` function to create a twoslash instance with cached language services
- [ ] Optional read-only mode to preserve notations, for better mapping and support custom languages (see `twoslash-vue` integration)
- Lighter, no longer deps on `lz-string` and `debug`

## Drawbacks

- Currently does not support `showEmit` option.
