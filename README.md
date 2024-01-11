# TwoSlash<sup>es</sup>

A fork and rewrite of [@typescript/twoslash](https://github.com/microsoft/TypeScript-Website/tree/v2/packages/ts-twoslasher), with improvements:

- Unified tokens information interface, easier to work with
- `createTwoslasher` function to create a twoslash instance with cached language services (~3x faster)
- ESM-first, dual CJS/ESM builds
- [ ] Optional read-only mode to preserve notations, for better mapping and support custom languages (see `twoslash-vue` integration)
- Lighter, no longer deps on `lz-string` and `debug`

### Breaking Changes

Breaking changes from `@typescript/twoslash`:

1. The information items have different signatures, and all different types of information are now unified into a single array `tokens` (TODO: explain more)
2. Main entry point `import "twoslashes"` bundles `typescript`, while a new sub-entry `import "twoslashes/core"` is dependency-free and requires providing your own typescript instance.
3. `showEmit` option is not supported yet.
