<script setup lang="ts">
// ---cut-start---
import { ref } from "vue"
interface Foo {
  bar: string
}
// ---cut-end---
const { hi } = useFoo()
// ---cut-start---
function useFoo() {
  const hi = ref<Foo>({ bar: "hello" })
  return { hi }
}
declare const foo: {
  hi: string
}
// ---cut-end---
</script>

<template>
  <div>
    {{ hi.bar }}
    //    ^?
  </div>
</template>
