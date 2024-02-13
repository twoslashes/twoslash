const ctx = {
  foo() { return 'bar' }
}
// ---cut---
ctx.foo()
ctx.foo
// ---cut-after---
