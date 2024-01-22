---
outline: deep
---

# Options References

## Compiler Options

Options of [TypeScript Compiler Options](https://www.typescriptlang.org/tsconfig#compilerOptions).

TwoSlash comes with a set of default compiler options that [can be found here](https://github.com/twoslashes/twoslash/blob/main/packages/twoslash/src/defaults.ts).

## Handbook Options

Check the [type definition](https://github.com/antfu/twoslashes/blob/main/packages/twoslash/src/types/handbook-options.ts) for the full list of options.

### `errors`

TypeScript error codes to be presented in the code. Use spaces to separate multiple error codes.

```ts twoslash input
// @errors: 2322 2588
const str: string = 1
str = 'Hello'
```

### `noErrors`

Suppress all errors in the code. You can also provide error codes to suppress specific errors.

```ts twoslash input
// @noErrors
const str: string = 1
str = 'Hello'
```

### `noErrorsCutted`

Ignore errors that occurred in the cutted code.

```ts twoslash input
// @noErrorsCutted
const hello = 'world'
// ---cut-after---
hello = 'hi' // Supposed to be an error, but ignored because it's cutted.
```

### `noErrorValidation`

Disable error validation, the errors will still be rendered but Twoslash will not throw to guard against errors in the code.

```ts twoslash input
// @noErrorValidation
const str: string = 1
```

### `keepNotations`

Tell Twoslash to not remove any notations, and keep the original code untouched. The `nodes` will have the position information of the original code. Useful for better source mapping combing with `meta.removals`.

```ts twoslash input
// @keepNotations
// @module: esnext
// @errors: 2322
const str: string = 1
```

### `showEmit`

Learn more in the [Showing the Emitted Files](/refs/notations#showing-the-emitted-files) section.

### `showEmittedFile`

Learn more in the [Showing the Emitted Files](/refs/notations#showing-the-emitted-files) section.
