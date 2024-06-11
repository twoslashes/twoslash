<script setup lang="ts">
import { ref } from "vue"
// ---cut-before---
interface Foo {
  bar: string
}
// ---cut---
const { hi } = useFoo()
function useFoo() {
  const hi = ref<Foo>({ bar: "hello" })
  return { hi }
}
// ---cut-after---
declare const foo: {
  hi: string
}
</script>

<template>
  <div>
    {{ hi.bar }}
  </div>
</template>
