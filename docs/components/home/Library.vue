<script setup lang="ts">
const props = defineProps<{ right: boolean, imgName: string, top: string, body: string, npm: string }>()
const classes = `lib-content ${props.right ? 'right' : ''}`
const img = `./prints/${props.imgName}.png`
</script>

<template>
  <div className="mid-6 lib">
    <div :class="classes">
      <img :src="img" width="150" height="150">
      <div>
        <h4>{props.top}</h4>
        <p>{props.body}</p>
      </div>
    </div>
    <a :href="`https://www.npmjs.com/package/${props.npm}`">{props.npm}</a>
  </div>
</template>
