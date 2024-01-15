<script setup lang="ts">
import { ref } from 'vue'

const tab = ref(0)
</script>

<template>
  <div class="twoslash-render-tabs" mt-6 mb-10>
    <div class="tabs" flex="~ gap-2" text-sm>
      <button
        flex="~ gap-1 items-center" p1
        border="b-solid 2 transparent" op50
        :class="{ active: tab === 0 }" @click="tab = 0"
      >
        <img src="/logo.svg" class="w-16px h-16px" mt--1>
        <span>TwoSlash Rendered</span>
      </button>

      <button
        flex="~ gap-1 items-center" p1
        border="b-solid 2 transparent" op50
        :class="{ active: tab === 1 }" @click="tab = 1"
      >
        <div i-ri-code-s-slash-fill class="w-16px h-16px" mt--1 />
        <span>Input Code</span>
      </button>
    </div>
    <div class="blocks">
      <div :class="{ inactive: tab !== 0 }">
        <slot name="rendered" />
      </div>
      <div :class="{ inactive: tab !== 1 }">
        <slot name="source" />
      </div>
    </div>
  </div>
</template>

<style>
.twoslash-render-tabs .blocks .inactive {
  display: none;
}

.twoslash-render-tabs .blocks .vp-adaptive-theme {
  margin: 0;
}

.twoslash-render-tabs .tabs .active {
  border-color: var(--vp-c-brand);
  opacity: 0.75;
}
</style>
