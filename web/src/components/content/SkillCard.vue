<template>
  <article
    class="skill-card"
    :class="{ 'is-disabled': skill.installed && skill.enabled === false }"
  >
    <div class="skill-card-top">
      <img
        v-if="skill.avatarUrl"
        class="skill-card-avatar"
        :src="skill.avatarUrl"
        :alt="skill.owner"
        loading="lazy"
        @error="onAvatarError"
      />
      <div class="skill-card-avatar-fallback" v-else>{{ skill.owner.charAt(0) }}</div>
      <div class="skill-card-info">
        <div class="skill-card-header">
          <button class="skill-card-name" type="button" :title="skill.displayName || skill.name" @click="$emit('select', skill)">{{ skill.displayName || skill.name }}</button>
          <template v-if="showStatusBadge">
            <span v-if="skill.installed && skill.enabled === false" class="skill-card-badge-disabled">{{ t('Disabled') }}</span>
            <span v-else-if="skill.installed" class="skill-card-badge">{{ t('Installed') }}</span>
          </template>
        </div>
        <span v-if="showOwner" class="skill-card-owner">{{ skill.owner }}</span>
      </div>
      <button
        v-if="showToggle && skill.installed && skill.path"
        class="skill-card-toggle"
        :class="{ 'is-on': skill.enabled !== false }"
        type="button"
        role="switch"
        :aria-checked="skill.enabled !== false"
        :aria-label="t('Enable {name}', { name: skill.displayName || skill.name })"
        :title="isToggling ? t('Saving…') : (skill.enabled !== false ? t('Enabled') : t('Disabled'))"
        :disabled="isToggling"
        @click="$emit('toggle-enabled', skill, skill.enabled === false)"
      ><span class="skill-card-toggle-thumb" /></button>
      <button
        v-if="showBrowseAction && skill.installed && skillDirPath"
        class="skill-card-browse"
        type="button"
        :title="t('Browse files')"
        @click.stop="onBrowse"
      >
        <IconTablerFolder class="skill-card-browse-icon" />
      </button>
    </div>
    <button v-if="skill.description" class="skill-card-desc" type="button" @click="$emit('select', skill)">{{ skill.description }}</button>
    <div v-if="metaLabels.length > 0" class="skill-card-meta-row">
      <span v-for="label in metaLabels" :key="label" class="skill-card-meta">{{ label }}</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUiLanguage } from '../../composables/useUiLanguage'
import IconTablerFolder from '../icons/IconTablerFolder.vue'

const props = withDefaults(defineProps<{
  skill: {
    name: string
    owner: string
    description: string
    displayName?: string
    publishedAt?: number
    avatarUrl?: string
    url: string
    installed: boolean
    source?: string
    path?: string
    enabled?: boolean
    installCountLabel?: string
  }
  showStatusBadge?: boolean
  showBrowseAction?: boolean
  showOwner?: boolean
  showToggle?: boolean
  isToggling?: boolean
}>(), {
  showStatusBadge: true,
  showBrowseAction: true,
  showOwner: true,
  showToggle: false,
  isToggling: false,
})

defineEmits<{ select: [skill: unknown]; 'toggle-enabled': [skill: unknown, enabled: boolean] }>()
const { t } = useUiLanguage()
const showStatusBadge = computed(() => props.showStatusBadge !== false)
const showBrowseAction = computed(() => props.showBrowseAction !== false)
const showOwner = computed(() => props.showOwner !== false)

const skillDirPath = computed(() => {
  const p = props.skill.path
  if (!p) return ''
  return p.replace(/\\/gu, '/').replace(/\/SKILL\.md$/iu, '')
})

function onBrowse(): void {
  const dir = skillDirPath.value
  if (!dir) return
  window.open(`/codex-local-browse${encodeURI(dir)}`, '_blank', 'noopener,noreferrer')
}

const publishedLabel = computed(() => {
  const ts = props.skill.publishedAt
  if (!ts) return ''
  const d = new Date(ts)
  const now = Date.now()
  const diff = now - ts
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  if (diff < 2592000_000) return `${Math.floor(diff / 86400_000)}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
})

const metaLabels = computed(() => {
  const labels: string[] = []
  if (props.skill.installCountLabel) labels.push(props.skill.installCountLabel)
  if (publishedLabel.value) labels.push(publishedLabel.value)
  return labels
})

function onAvatarError(e: Event): void {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
}
</script>

<style scoped>
@reference "tailwindcss";

.skill-card {
  @apply flex flex-col gap-1.5 rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-300;
}

.skill-card.is-disabled {
  @apply border-zinc-300;
}

.skill-card-top {
  @apply flex flex-wrap items-start gap-2.5;
}

.skill-card-avatar {
  @apply w-8 h-8 rounded-full shrink-0 bg-zinc-100;
}

.skill-card-avatar-fallback {
  @apply w-8 h-8 rounded-full shrink-0 bg-zinc-200 text-zinc-500 flex items-center justify-center text-xs font-medium uppercase;
}

.skill-card-info {
  @apply flex flex-col gap-0.5 min-w-[4rem] flex-1;
}

.skill-card-header {
  @apply flex items-center gap-2;
}

.skill-card-name {
  @apply text-sm font-medium text-zinc-900 truncate border-0 bg-transparent p-0 text-left cursor-pointer hover:underline;
}

.skill-card-badge {
  @apply shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 leading-none;
}

.skill-card-badge-disabled {
  @apply shrink-0 rounded-md border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 leading-none;
}

.skill-card-owner {
  @apply text-xs text-zinc-400;
}

.skill-card-browse {
  @apply shrink-0 ml-auto h-7 w-7 rounded-lg border-0 bg-transparent text-zinc-300 flex items-center justify-center transition hover:bg-zinc-100 hover:text-zinc-600;
}

.skill-card-browse-icon {
  @apply w-4 h-4;
}

.skill-card-desc {
  @apply m-0 text-[0.8125rem] leading-relaxed whitespace-pre-line text-zinc-600 border-0 bg-transparent p-0 text-left cursor-pointer;
  overflow-wrap: anywhere;
}

.skill-card-toggle {
  @apply relative shrink-0 w-9 h-5 my-1.5 rounded-full border-0 bg-zinc-300 cursor-pointer transition-colors disabled:cursor-wait disabled:opacity-50;
}
.skill-card-toggle.is-on { @apply bg-emerald-600; }
.skill-card-toggle-thumb { @apply absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform; }
.skill-card-toggle.is-on .skill-card-toggle-thumb { transform: translateX(1rem); }
.skill-card-toggle:focus-visible { outline: 2px solid var(--color-emerald-600); outline-offset: 3px; }
.skill-card-toggle::before { content: ''; position: absolute; inset: -0.65rem -0.3rem; }
@media (prefers-reduced-motion: reduce) {
  .skill-card-toggle, .skill-card-toggle-thumb { transition: none; }
}

.skill-card-meta-row {
  @apply flex flex-wrap gap-1.5;
}

.skill-card-meta {
  @apply text-[10px] text-zinc-300;
}
</style>
