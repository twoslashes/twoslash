<script setup lang="ts">
import { ref } from "vue"
interface Foo {
  bar: string
}
// ---cut---
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
