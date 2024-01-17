<script setup lang="ts">
import { ref, computed } from 'vue'
//             ^?





const count = ref(0)

const double = computed(() => count.value * 2)
//     ^?
</script>

<script>
export default {
  name: 'HelloWorld',
  data() {
    return {
      msg: 'Hello!'
    }
  },
  methods: {
    greet() {
      console.log(this.msg)
    }
  }
}
</script>

<template>
  <button @click="count++">{{ msg }} Count is: {{ count }}</button>
//           ^?
</template>
