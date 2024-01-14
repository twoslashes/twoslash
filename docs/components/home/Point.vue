<script setup lang="ts">
const props = defineProps<{ msg: string }>()
</script>

<template>
  <p class="mid-6 has-funny-opening-letter">
    <span class="eu">{{ props.msg[0] }}</span>
    {{ props.msg.substring(1) }}
  </p>
</template>
