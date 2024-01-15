<script setup lang="ts">
import { ref } from 'vue'

const tab = ref(0)
</script>

<template>
  <div class="twoslash-render-tabs">
    <div class="tabs" flex="~ gap-2" text-sm>
      <button
        flex="~ gap-1 items-center" px2 py1
        border="b-solid 2 transparent" op50
        :class="tab === 0 ? 'active' : 'inactive'" @click="tab = 0"
      >
        <img src="/logo.svg" class="w-16px h-16px" mt--1>
        <span>TwoSlash Rendered</span>
      </button>

      <button
        flex="~ gap-1 items-center" px2 py1
        border="b-solid 2 transparent" op50
        :class="tab === 1 ? 'active' : 'inactive'" @click="tab = 1"
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
.twoslash-render-tabs {
  margin: 16px -24px 32px -24px;
}

@media (min-width: 640px) {
  .twoslash-render-tabs {
    margin: 16px 0 32px 0;
  }
}

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

.twoslash-render-tabs .tabs .inactive img {
  filter: grayscale(100%);
}
</style>
