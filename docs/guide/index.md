---
outline: deep
---

# Introduction

A markup format for TypeScript code, ideal for creating self-contained code samples which let the TypeScript compiler do the extra leg-work. Inspired by the [fourslash test system](https://github.com/orta/typescript-notes/blob/master/systems/testing/fourslash.md).

Used as a pre-parser before showing code samples inside the TypeScript website and to create a standard way for us to create examples for bugs on the compiler's issue tracker.

### What is Twoslash?

It might be easier to show instead of tell. Here is an example of code from the TypeScript handbook. We'll use
twoslash to let the compiler handle error messaging and provide rich highlight info.

##### Before

> Tuple types allow you to express an array with a fixed number of elements whose types are known, but need not be the same. For example, you may want to represent a value as a pair of a `string` and a `number`:

```ts
// Declare a tuple type
let x: [string, number]

// Initialize it
x = ['hello', 10] // OK
// Initialize it incorrectly
x = [10, 'hello'] // Error
```

> When accessing an element with a known index, the correct type is retrieved:

```ts
console.log(x[0].substring(1)) // OK
console.log(x[1].substring(1)) // Error, 'number' does not have 'substring'
```

##### After

> Tuple types allow you to express an array with a fixed number of elements whose types are known, but need not be the same. For example, you may want to represent a value as a pair of a `string` and a `number`:

```ts twoslash
// @errors: 2322
// Declare a tuple type
let x: [string, number]

// Initialize it
x = ['hello', 10]
// Initialize it incorrectly
x = [10, 'hello']
```

> When accessing an element with a known index, the correct type is retrieved:

```ts twoslash
// @errors: 2339
let x: [string, number]
x = ['hello', 10] // OK
// ---cut---
console.log(x[0].substring(1))
console.log(x[1].substring(1))
```
