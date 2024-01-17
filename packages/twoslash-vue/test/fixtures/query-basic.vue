<script setup lang="ts">
import { ref, computed } from 'vue'
//             ^?

const count = ref(0)
const double = computed(() => count.value * 2)
//     ^?
</script>

<template>
  <button @click="count++">count is: {{ count }}</button>
  //         ^?
  <p>Count is: {{ count }}</p>
  //               ^?
</template>
