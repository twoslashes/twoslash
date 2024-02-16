// @paths: {"@foo": ["./foo"]}
// @filename: foo.ts
export const a = 1

// @filename: bar.ts
import { a } from "@foo"

const b = a + 1
//    ^?
