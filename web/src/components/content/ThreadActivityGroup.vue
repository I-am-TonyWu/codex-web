<template>
  <details class="activity-group" @toggle="expanded = ($event.target as HTMLDetailsElement).open">
    <summary class="activity-summary" :data-tone="status.tone">
      <IconTablerTerminal class="activity-icon" aria-hidden="true" />
      <span class="activity-label">{{ processSummary(messages) }}</span>
      <span v-if="status.label" class="activity-status">{{ status.label }}</span>
      <span class="activity-chevron" aria-hidden="true">›</span>
    </summary>
    <div v-if="expanded" class="activity-details">
      <template v-for="message in messages" :key="message.id">
        <details v-if="message.commandExecution" class="activity-command">
          <summary>{{ commandAction(message.commandExecution.command) }}<span v-if="processStatus([message]).label"> · {{ processStatus([message]).label }}</span></summary>
          <pre class="activity-code">{{ message.commandExecution.command }}</pre>
          <pre v-if="message.commandExecution.aggregatedOutput" class="activity-code activity-output">{{ message.commandExecution.aggregatedOutput }}</pre>
        </details>
        <div v-else-if="message.images?.length" class="activity-images">
          <p class="activity-image-label">查看了 {{ message.images.length }} 张图片</p>
          <button v-for="(url, index) in message.images" :key="url" type="button" class="activity-image-button" :aria-label="`查看过程图片 ${index + 1}`" @click="emit('openImage', url)">
            <img :src="url" :alt="`过程图片 ${index + 1}`" loading="lazy" @load="emit('resize')" @error="emit('resize')" />
          </button>
        </div>
      </template>
    </div>
  </details>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UiMessage } from '../../types/codex'
import { commandAction, processStatus, processSummary } from '../../utils/conversationPresentation'
import IconTablerTerminal from '../icons/IconTablerTerminal.vue'
const props = defineProps<{ messages: UiMessage[] }>()
const emit = defineEmits<{ openImage: [url: string]; resize: [] }>()
const expanded = ref(false)
const status = computed(() => processStatus(props.messages))
</script>
<style scoped>
.activity-group { min-width: 0; color: var(--activity-muted, #64748b); font-size: 13px; line-height: 1.6; }
.activity-summary { display: flex; align-items: center; gap: 8px; padding: 5px 0; cursor: pointer; list-style: none; border-radius: 6px; }
.activity-summary::-webkit-details-marker { display: none; }
.activity-summary:hover { color: var(--activity-text, #334155); }
.activity-summary:focus-visible { outline: 2px solid #60a5fa; outline-offset: 3px; }
.activity-label { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.activity-icon { flex-shrink: 0; width: 16px; height: 16px; }
.activity-status { flex-shrink: 0; font-size: 12px; }
[data-tone='error'] .activity-status { color: var(--activity-error, #be123c); }
[data-tone='running'] .activity-status { color: var(--activity-running, #a16207); }
.activity-chevron { flex-shrink: 0; font-size: 18px; transition: transform 150ms ease; }
.activity-group[open] > summary .activity-chevron { transform: rotate(90deg); }
.activity-details { margin: 5px 0 8px 24px; padding: 10px 12px; border-radius: 8px; background: var(--activity-bg, #f1f5f9); }
.activity-command { padding: 4px 0; }
.activity-command > summary { cursor: pointer; overflow-wrap: anywhere; }
.activity-code { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 260px; overflow: auto; font-size: 12px; color: var(--activity-text, #334155); margin: 8px 0; }
.activity-images { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
.activity-image-label { width: 100%; margin: 0; }
.activity-image-button { padding: 0; border: 0; background: transparent; cursor: zoom-in; }
.activity-image-button img { display: block; width: auto; max-width: min(220px, 65vw); max-height: 160px; object-fit: contain; border-radius: 6px; }
@media (max-width: 480px) {
  .activity-summary { display: grid; grid-template-columns: 16px minmax(0, 1fr) 10px; gap: 3px 8px; }
  .activity-icon { grid-column: 1; grid-row: 1; align-self: start; margin-top: 3px; }
  .activity-label { grid-column: 2; grid-row: 1; }
  .activity-status { grid-column: 2; grid-row: 2; }
  .activity-chevron { grid-column: 3; grid-row: 1; }
}
@media (prefers-reduced-motion: reduce) { .activity-chevron { transition: none; } }
</style>
