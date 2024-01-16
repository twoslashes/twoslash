# Options References

## Compiler Options

Options of [TypeScript Compiler Options](https://www.typescriptlang.org/tsconfig#compilerOptions).

## Handbook Options

Check the [type definition](https://github.com/antfu/twoslashes/blob/main/packages/twoslash/src/types/handbook-options.ts) for the full list of options.

### `errors`

TypeScript error codes to be presented in the code. Use space to separate multiple error codes.

```ts twoslash
// @errors: 2322 2588
const str: string = 1
str = 'Hello'
```

### `noErrors`

Suppress errors in the code. Or provide error codes to suppress specific errors.

```ts twoslash
// @noErrors
const str: string = 1
str = 'Hello'
```

### `noErrorsCutted`

Ignore errors that occurred in the cutted code.

```ts twoslash
// @noErrorsCutted
const hello = 'world'
// ---cut-after---
hello = 'hi' // supposed to be an error, but ignored because it's cutted
```

### `noErrorValidation`

Disable error validation, the errors will still be rendered but Twoslash will not throw to guard against errors in the code.

### `keepNotations`

Tell Twoslash to not remove any notations, and keep the original code untouched. The `nodes` will have the position information of the original code. Useful for better source mapping combing with `meta.removals`.

```ts twoslash
// @keepNotations
// @module: esnext
// @errors: 2322
const str: string = 1
```
