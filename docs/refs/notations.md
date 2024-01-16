# Notation References

## Queries in TwoSlash

One of the key reasons for making TwoSlash is the ability to use the TypeScript compiler to pull out type information about your code mechanically. TwoSlash comes with two different ways to query your code: `?^` and `?|`.

### Extract Type

Using `^?` you can pull out type information about a particular identifier in the line of code above it.

```ts twoslash
const hi = 'Hello'
const msg = `${hi}, world`
//    ^?
```

### Completions

Using `^|` you can pull out information about a what the auto-complete looks like at a particular location.

```ts twoslash
// @noErrors
console.e
//       ^|
```

What happens is that TwoSlash makes a request to TypeScript to get the auto-complete at the point of the `^`, and then filters the possible outputs based on the letters following the `.`. Up to 5 results will be shown inline, and if a completion is marked as deprecated - that will be respected in the output.

So, in this case, TwoSlash asks TypeScript for completions of `console`, then filters down to completions which start with `e`. Note that the compiler flag for `// @noErrors` is set, because `console.e` is a failing TypeScript code sample but we don't really care about that.

## Cutting a Code Sample

Every TwoSlash code sample needs to be a complete TypeScript program realistically, basically it needs to compile. Quite often to make it compile, there is a bunch of code which isn't relevant to the user. This can be extracted out of the code sample via `// ---cut---` which removes all of the code above it from the output.

### `---cut---`

Cut works after TypeScript has generated the project and pulled out all the editor information (like identifiers, queries, highlights etc) and then amends all of their offsets and lines to re-fit the smaller output. What your user sees is everything below the `---cut---`.

```ts twoslash
const level: string = 'Danger'
// ---cut---
console.log(level)
```

Would only show a single line.

```ts twoslash
// @filename: a.ts
export const helloWorld: string = 'Hi'
// ---cut---
// @filename: b.ts
import { helloWorld } from './a'

console.log(helloWorld)
```

Would only show the last two lines, but to TypeScript it was a program with 2 files and all of the IDE information is hooked up correctly across the files. This is why `// @filename: [file]` is specifically the only TwoSlash command which _is not_ removed, because if it's not relevant it can be `---cut---` away.

### `---cut-after---`

The sibling to `---cut---` which trims anything after the sigil:

<!-- eslint-skip -->
```ts twoslash
const level: string = 'Danger'
// ---cut---
console.log(level)
// ---cut-after---
console.log('This is not shown')
```

## Showing the Emitted Files

Running a TwoSlash code sample is a full TypeScript compiler run, and that run will create files inside the virtual file system. You can replace the contents of your code sample with the results of running TypeScript over the project.

#### `@showEmit`

`// @showEmit` is the main command to tell Shiki TwoSlash that you want to replace the output of your code sample with the equivalent `.js` file.

```ts twoslash
// @showEmit
const level: string = 'Danger'
```

Would show the `.js` file which this `.ts` file represents. You can see TypeScript add 'use strict' and `: string` is removed from the output.

#### `@showEmittedFile: [file]`

While the `.js` file is probably the most useful file out of the box, TypeScript does emit other files if you have the right flags enabled (`.d.ts` and `.map`) but also when you have a multi-file code sample - you might need to tell TwoSlash which file to show. For all these cases you can _also_ add `@showEmittedFile: [file]` to tell Shiki TwoSlash which file you want to show.

```ts twoslash
// @declaration
// @showEmit
// @showEmittedFile: index.d.ts
export const hello = 'world'
```

> Shows the `.d.ts` for a TypeScript code sample

```ts
// @sourceMap
// @showEmit
// @showEmittedFile: index.js.map
export const hello = 'world'
```

> Shows the `.map` for the JavaScript -> TypeScript

```ts
// @declaration
// @declarationMap
// @showEmit
// @showEmittedFile: index.d.ts.map
export const hello = 'world'
```

> Shows the `.map` for a `.d.ts` (mainly used for project references)

```ts
// @showEmit
// @showEmittedFile: b.js
// @filename: a.ts
export const helloWorld: string = 'Hi'

// @filename: b.ts
import { helloWorld } from './a'
console.log(helloWorld)
```

> Shows `.js` file for `b.ts`
