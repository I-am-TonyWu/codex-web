<template>
  <div class="skills-hub">
    <div class="skills-hub-header">
      <h2 class="skills-hub-title">{{ t('Skills Hub') }}</h2>
      <p class="skills-hub-subtitle">{{ t('Manage your personally installed skills') }}</p>
    </div>

    <div v-if="toast" class="skills-hub-toast" :class="toastClass">{{ toast.text }}</div>

    <div class="skills-search-form">
        <input
          v-model="skillSearchQuery"
          class="skills-search-input"
          type="search"
          :placeholder="t('Search personal skills...')"
          :aria-label="t('Search personal skills...')"
        />
    </div>

    <div v-if="filteredInstalled.length > 0" class="skills-hub-section">
      <button class="skills-hub-section-toggle" type="button" @click="isInstalledOpen = !isInstalledOpen">
        <span class="skills-hub-section-title">{{ t('Personal skills ({count})', { count: filteredInstalled.length }) }}</span>
        <IconTablerChevronRight class="skills-hub-section-chevron" :class="{ 'is-open': isInstalledOpen }" />
      </button>
      <div v-if="isInstalledOpen" class="skills-hub-grid">
        <SkillCard
          v-for="skill in filteredInstalled"
          :key="skill.path || skill.name"
          :skill="skill"
          :show-status-badge="skill.enabled === false"
          :show-owner="false"
          :show-browse-action="false"
          :show-toggle="true"
          :is-toggling="togglingPaths.has(skill.path || '')"
          @toggle-enabled="(skill, enabled) => handleToggleEnabled(skill as HubSkill, enabled)"
          @select="(skill) => openDetail(skill as HubSkill)"
        />
      </div>
    </div>

    <slot name="after-installed" />

    <div class="skills-hub-section">
      <div v-if="isLoading" class="skills-hub-loading">{{ t('Loading skills...') }}</div>
      <div v-else-if="error" class="skills-hub-error">
        <span>{{ error }}</span>
        <a class="skills-error-feedback" :href="feedbackUrl" target="_blank" rel="noopener noreferrer" @click="prepareSkillsErrorFeedback($event, error)">{{ t('Send feedback') }}</a>
      </div>
      <div v-else-if="installedSkills.length === 0" class="skills-hub-empty">{{ t('No personal skills installed.') }}</div>
      <div v-else-if="filteredInstalled.length === 0" class="skills-hub-empty">{{ t('No matching skills found.') }}</div>
    </div>

    <SkillDetailModal
      :skill="detailSkill"
      :visible="isDetailOpen"
      :is-installing="isDetailInstalling"
      :is-uninstalling="isDetailUninstalling"
      :is-toggling="togglingPaths.has(detailSkill.path || '')"
      :is-trying="props.tryInFlightKey === skillTryKey(detailSkill)"
      @close="isDetailOpen = false"
      @install="handleInstall"
      @uninstall="handleUninstall"
      @toggle-enabled="handleToggleEnabled"
      @try="handleTrySkill"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import IconTablerChevronRight from '../icons/IconTablerChevronRight.vue'
import SkillCard from './SkillCard.vue'
import SkillDetailModal, { type HubSkill } from './SkillDetailModal.vue'
import { useFeedbackDiagnostics } from '../../composables/useFeedbackDiagnostics'
import { useUiLanguage } from '../../composables/useUiLanguage'
import { setSkillEnabled } from '../../api/codexGateway'

const EMPTY_SKILL: HubSkill = { name: '', owner: '', description: '', url: '', installed: false }
type SkillsHubPayload = { installed?: HubSkill[] }

const installedSkills = ref<HubSkill[]>([])
const isLoading = ref(false)
const error = ref('')
const skillSearchQuery = ref('')
const isInstalledOpen = ref(true)
const isDetailOpen = ref(false)
const detailSkill = ref<HubSkill>(EMPTY_SKILL)
const toast = ref<{ text: string; type: 'success' | 'error' } | null>(null)
const actionSkillKey = ref('')
const isInstallActionInFlight = ref(false)
const isUninstallActionInFlight = ref(false)
const togglingPaths = ref(new Set<string>())
let toastTimer: ReturnType<typeof setTimeout> | null = null
const { t } = useUiLanguage()
const { buildFeedbackUrl, feedbackBaseUrl, recordVisibleFailure } = useFeedbackDiagnostics()
const feedbackUrl = feedbackBaseUrl()

const props = defineProps<{
  tryInFlightKey?: string
}>()

const emit = defineEmits<{
  'skills-changed': []
  'try-item': [payload: { kind: 'skill'; name: string; displayName: string; skillPath?: string }]
}>()

const toastClass = computed(() => toast.value?.type === 'error' ? 'skills-hub-toast-error' : 'skills-hub-toast-success')
const currentDetailSkillKey = computed(() => `${detailSkill.value.owner}/${detailSkill.value.name}`)
const isDetailInstalling = computed(() =>
  isInstallActionInFlight.value && actionSkillKey.value === currentDetailSkillKey.value,
)
const isDetailUninstalling = computed(() =>
  isUninstallActionInFlight.value && actionSkillKey.value === currentDetailSkillKey.value,
)
const filteredInstalled = computed(() => {
  const query = skillSearchQuery.value.trim().toLowerCase()
  return installedSkills.value.filter(skill => `${skill.name} ${skill.description}`.toLowerCase().includes(query))
})

function showToast(text: string, type: 'success' | 'error' = 'success'): void {
  toast.value = { text, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3000)
}

function prepareSkillsErrorFeedback(event: MouseEvent, message: string): void {
  recordVisibleFailure(message)
  const target = event.currentTarget
  if (target instanceof HTMLAnchorElement) {
    target.href = buildFeedbackUrl()
  }
}

function applySkillsPayload(payload: SkillsHubPayload): void {
  installedSkills.value = payload.installed ?? []
  const current = installedSkills.value.find(item => item.path === detailSkill.value.path)
  if (current) detailSkill.value = { ...detailSkill.value, ...current }
}

function localSearchSkill(installed: HubSkill, registrySkill: HubSkill): HubSkill {
  return {
    ...installed,
    installed: true,
    source: registrySkill.source,
    publishedAt: registrySkill.publishedAt,
  }
}

let isRefreshingSkills = false
let skillsRevision = 0
async function fetchSkills(silent = false): Promise<void> {
  if (isRefreshingSkills) return
  isRefreshingSkills = true
  const revision = skillsRevision
  if (!silent) isLoading.value = true
  error.value = ''
  try {
    const resp = await fetch('/codex-api/skills-hub')
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = (await resp.json()) as SkillsHubPayload
    if (revision === skillsRevision) applySkillsPayload(data)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load skills'
  } finally {
    isRefreshingSkills = false
    isLoading.value = false
    scheduleSkillRefresh()
  }
}

function scheduleSkillRefresh(): void {
  if (!isMounted) return
  window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    if (document.hidden) scheduleSkillRefresh()
    else void fetchSkills(true)
  }, installedSkills.value.some(skill => skill.translationStatus === 'pending') ? 3000 : 30_000)
}

defineExpose({ refresh: fetchSkills })

function openDetail(skill: HubSkill): void {
  const installedSkill = skill.installed ? installedSkills.value.find((candidate) => candidate.name === skill.name) : undefined
  detailSkill.value = installedSkill ? localSearchSkill(installedSkill, skill) : skill
  isDetailOpen.value = true
}

async function handleInstall(skill: HubSkill): Promise<void> {
  actionSkillKey.value = `${skill.owner}/${skill.name}`
  isInstallActionInFlight.value = true
  try {
    const resp = await fetch('/codex-api/skills-hub/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: skill.owner, name: skill.name, source: skill.source }),
    })
    const data = (await resp.json()) as { ok?: boolean; error?: string; path?: string }
    if (!data.ok) throw new Error(data.error || 'Install failed')
    if (!data.path) throw new Error('Install completed but no local skill path was returned')
    await fetchSkills()
    const installed = installedSkills.value.find((candidate) => candidate.name === skill.name)
    if (!installed?.path) {
      throw new Error('Install completed but the local skill was not found after refresh')
    }
    detailSkill.value = localSearchSkill(installed, skill)
    showToast(`${skill.displayName || skill.name} skill installed`)
    isDetailOpen.value = false
    emit('skills-changed')
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'Failed to install skill', 'error')
  } finally {
    isInstallActionInFlight.value = false
  }
}

async function handleUninstall(skill: HubSkill): Promise<void> {
  actionSkillKey.value = `${skill.owner}/${skill.name}`
  isUninstallActionInFlight.value = true
  try {
    const resp = await fetch('/codex-api/skills-hub/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: skill.name, path: skill.path }),
    })
    const data = (await resp.json()) as { ok?: boolean; error?: string }
    if (!data.ok) throw new Error(data.error || 'Uninstall failed')
    installedSkills.value = installedSkills.value.filter((s) => s.name !== skill.name)
    showToast(`${skill.displayName || skill.name} skill uninstalled`)
    isDetailOpen.value = false
    emit('skills-changed')
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'Failed to uninstall skill', 'error')
  } finally {
    isUninstallActionInFlight.value = false
  }
}

async function handleToggleEnabled(skill: HubSkill, enabled: boolean): Promise<void> {
  const path = skill.path
  if (!path || togglingPaths.value.has(path)) return
  togglingPaths.value.add(path)
  try {
    await setSkillEnabled(path, enabled)
    skillsRevision += 1
    installedSkills.value = installedSkills.value.map(item => item.path === path ? { ...item, enabled } : item)
    if (detailSkill.value.path === path) detailSkill.value = { ...detailSkill.value, enabled }
    showToast(t(enabled ? '{name} enabled' : '{name} disabled', { name: skill.displayName || skill.name }))
    emit('skills-changed')
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'Failed to update skill', 'error')
  } finally {
    togglingPaths.value.delete(path)
  }
}

function handleTrySkill(skill: HubSkill): void {
  if (!skill.installed || skill.enabled === false) return
  if (props.tryInFlightKey) return
  emit('try-item', {
    kind: 'skill',
    name: skill.name,
    displayName: skill.displayName || skill.name,
    skillPath: skill.path,
  })
  isDetailOpen.value = false
}

function skillTryKey(skill: HubSkill): string {
  return `skill:${skill.name}:${skill.path ?? ''}`
}

const visibleSkillErrors = [
  error,
]

let syncTimer: number | undefined
let isMounted = false
onUnmounted(() => { isMounted = false; window.clearTimeout(syncTimer) })
onMounted(() => {
  isMounted = true
  void fetchSkills()
})

watch(visibleSkillErrors, (values, oldValues) => {
  values.forEach((value, index) => {
    if (value === oldValues[index]) return
    const message = value.trim()
    if (message) {
      recordVisibleFailure(message)
    }
  })
})
</script>

<style scoped>
@reference "tailwindcss";

.skills-hub {
  @apply flex flex-col gap-3 sm:gap-4 p-3 sm:p-6 max-w-4xl mx-auto w-full overflow-y-auto h-full;
}

.skills-hub-header {
  @apply flex flex-col gap-1;
}

.skills-hub-title {
  @apply text-xl sm:text-2xl font-semibold text-zinc-900 m-0;
}

.skills-hub-subtitle {
  @apply text-sm text-zinc-500 m-0;
}

.skills-hub-sort {
  @apply shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 hover:border-zinc-300 cursor-pointer;
}

.skills-search-panel {
  @apply rounded-xl border border-zinc-200 bg-white p-3 flex flex-col gap-2;
}

.skills-search-header {
  @apply flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between;
}

.skills-search-copy {
  @apply flex flex-col gap-0.5 text-sm text-zinc-700;
}

.skills-search-copy span {
  @apply text-xs text-zinc-500;
}

.skills-directory-link {
  @apply inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-white hover:text-zinc-900;
}

.skills-search-form {
  @apply flex flex-col gap-2 sm:flex-row;
}

.skills-search-input {
  @apply min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none placeholder-zinc-400 transition focus:border-zinc-300 focus:bg-white;
}

.skills-hub-toast {
  @apply rounded-lg px-3 py-2 text-sm font-medium;
}

.skills-hub-toast-success {
  @apply border border-emerald-200 bg-emerald-50 text-emerald-700;
}

.skills-hub-toast-error {
  @apply border border-rose-200 bg-rose-50 text-rose-700;
}

.skills-hub-section {
  @apply flex flex-col gap-2;
}

.skills-hub-section-toggle {
  @apply flex items-center gap-1.5 border-0 bg-transparent p-0 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 cursor-pointer;
}

.skills-hub-section-title {
  @apply text-sm font-medium;
}

.skills-hub-section-chevron {
  @apply w-3.5 h-3.5 transition-transform;
}

.skills-hub-section-chevron.is-open {
  @apply rotate-90;
}

.skills-hub-grid {
  @apply grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3;
}

.skills-hub-loading {
  @apply text-sm text-zinc-400 py-8 text-center;
}

.skills-hub-error {
  @apply flex items-start justify-between gap-3 text-sm text-rose-600 p-4 text-left rounded-lg border border-rose-200 bg-rose-50;
}

.skills-error-feedback {
  @apply shrink-0 rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-300;
}

.skills-hub-empty {
  @apply text-sm text-zinc-400 py-8 text-center;
}
</style>
