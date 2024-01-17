<script setup lang="ts">
import { ref } from "vue"

const count1 = ref(1)

function count2() {
  return count1.value + 1
}
</script>

<template>
  <div>
    {{ count1 }}
    //  ^|
  </div>
</template>
