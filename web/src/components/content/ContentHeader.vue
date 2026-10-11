<template>
  <header class="content-header">
    <div class="content-leading" :class="{ 'is-accent': accent }">
      <slot name="leading" />
    </div>
    <div class="content-title-group">
      <h1 class="content-title" :class="{ 'is-accent': accent }" :title="title">{{ title }}</h1>
      <slot name="title-actions" />
    </div>
    <div class="content-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  accent?: boolean
}>()
</script>

<style scoped>
@reference "tailwindcss";

.content-header {
  @apply relative z-[250] w-full min-w-0 min-h-11 flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 bg-white;
}

.content-title-group {
  @apply min-w-0 flex-1 flex items-center gap-1.5;
}

.content-title {
  @apply m-0 min-w-0 truncate text-lg font-bold leading-7 text-slate-900 max-sm:text-base;
}

.content-title.is-accent {
  @apply text-lg font-semibold leading-7 tracking-[-0.01em] text-zinc-950 sm:text-[1.4rem];
}

.content-actions {
  @apply ml-auto flex shrink-0 items-center justify-end gap-1;
}

.content-leading {
  @apply flex shrink-0 items-center gap-1;
}

.content-leading.is-accent {
  @apply gap-2;
}

:global(:root.dark) .content-title.is-accent {
  @apply text-zinc-100;
}
</style>
