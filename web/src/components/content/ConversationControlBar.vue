<template>
  <div ref="rootRef" class="control-bar" aria-label="会话控制" :aria-busy="busy" :data-open="expanded">
    <span class="control-summary">
      <span class="control-dot" :class="{ owned: state?.proof, blocked: state?.activity === 'external' }" />
      <span role="status">{{ label }}</span>
      <span v-if="notice && connectionKnown" class="control-hint" :title="notice">· 有提示</span>
    </span>
    <button ref="triggerRef" class="control-toggle" type="button" aria-label="网页控制选项" aria-haspopup="dialog" :aria-expanded="expanded" @click="expanded = !expanded"><IconTablerDots /></button>
    <Teleport to="body">
    <div v-if="expanded" ref="panelRef" class="control-menu" :style="menuStyle" role="dialog" aria-label="网页控制选项" @keydown.esc.stop.prevent="closeMenu">
    <div class="control-actions">
      <button v-if="!state?.proof" :disabled="busy || !state" @click="takeover(false)">{{ state?.owner ? '接管此对话' : '取得控制权' }}</button>
      <button v-if="state?.turnId && ['running', 'approval'].includes(state.activity)" :disabled="busy" @click="takeover(true)">停止任务并接管</button>
      <button v-if="state?.proof" :disabled="busy" @click="leave">退出控制</button>
      <button :disabled="busy" @click="refresh">刷新网页控制</button>
      <button :disabled="busy || retrying || Boolean(state?.owner && !state?.proof)" @click="emit('retry')">{{ retrying ? '正在检查…' : '重新检查写入状态' }}</button>
      <details class="control-help">
        <summary>交接说明</summary>
        <p>接管网页控制后，当前任务继续运行。旧网页只能查看；两端草稿不会自动发送。退出、断线或后台超过 30 秒后，其他网页可取得控制，任务继续。</p>
        <p>接管或服务重启后，原待发送队列暂停，请编辑后明确重新排队或手动发送。</p>
        <p>网页控制权与本机写入锁是两层状态。桌面持有会话时，会尝试连接桌面的本机协同通道，在同一条对话发送、同步结果和审批；不需要先释放或另建分支。桌面通道不兼容或断开时保留草稿，重新检查不会自动发送。</p>
        <p>协同模式沿用网页服务配置的权限与审批策略，默认完全访问、无需审批；桌面自行发起的任务使用桌面设置。桌面正在执行或等待审批时，请等待完成，或明确停止任务后再发送。改名、回滚和归档等操作仍可能需要在客户端完成。</p>
        <button disabled title="尚无经过验证的桌面原生会话控制接口">释放桌面会话（暂不可用）</button>
        <button :disabled="busy" @click="checkDelivery">核对发送结果</button>
        <button :disabled="busy" @click="clearUncertain">已核对历史，清除待确认标记</button>
      </details>
    </div>
      <p v-if="notice" class="control-notice" role="status">{{ notice }}</p>
    </div>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import IconTablerDots from '../icons/IconTablerDots.vue'
import { conversationStates, refreshControl, claimControl, releaseControl, heartbeatControl, checkPendingSend, clearPendingSend } from '../../api/conversationControl'
const props = defineProps<{ threadId: string; retrying?: boolean }>()
const emit = defineEmits<{ acquired: []; retry: []; statusKnown: [known: boolean] }>()
const busy = ref(false)
const notice = ref('')
const expanded = ref(false)
const connectionKnown = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})
function placeMenu() {
  const rect = triggerRef.value?.getBoundingClientRect()
  if (!rect) return
  const width = panelRef.value?.getBoundingClientRect().width ?? 0
  const right = Math.min(Math.max(8, window.innerWidth - rect.right), Math.max(8, window.innerWidth - width - 8))
  menuStyle.value = { bottom: `${window.innerHeight - rect.top + 6}px`, right: `${right}px`, maxHeight: `${Math.max(48, rect.top - 12)}px` }
}
function closeMenu() { expanded.value = false; triggerRef.value?.focus() }
function onOutsidePointer(event: PointerEvent) {
  if (event.target instanceof Node && !rootRef.value?.contains(event.target) && !panelRef.value?.contains(event.target)) expanded.value = false
}
watch(expanded, async value => { if (value) { await nextTick(); placeMenu(); panelRef.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus() } })
onMounted(() => { window.addEventListener('pointerdown', onOutsidePointer); window.addEventListener('resize', placeMenu); window.addEventListener('scroll', placeMenu, true) })
function setKnown(known: boolean) { connectionKnown.value = known; emit('statusKnown', known) }
const state = computed(() => conversationStates[props.threadId])
const label = computed(() => {
  const value = state.value
  if (!connectionKnown.value || !value) return '控制状态待确认'
  if (value.transferring) return '正在交接，请稍候'
  if (value.activity === 'external' && value.owner && !value.proof) return `其他${value.owner.label}控制 · 当前只读`
  if (value.activity === 'external') return '本机占用待检查'
  const owner = value.proof ? '本网页控制' : value.owner ? `其他${value.owner.label}控制 · 只读` : '网页控制未取得'
  return owner + (value.executionSource === 'desktop' ? ' · 桌面协同' : '')
})
async function run(action: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true; notice.value = ''
  try { await action() } catch (error) { notice.value = error instanceof Error ? error.message : '连接失败，请刷新状态。' } finally { busy.value = false }
}
async function refresh() { await run(async () => { try { await refreshControl(props.threadId); notice.value = ''; setKnown(true) } catch (error) { setKnown(false); throw error } }) }
async function takeover(stop: boolean) {
  if (stop && !window.confirm('停止会保留已经完成的文件修改，不能撤销已执行操作。确认停止当前任务并接管？')) return
  await run(async () => { await claimControl(props.threadId, true, stop); notice.value = stop ? '任务已确认停止。草稿尚未发送。' : '已取得控制权。草稿尚未发送。'; emit('acquired') })
}
async function leave() { await run(async () => { await releaseControl(props.threadId); notice.value = '已退出控制，正在执行的任务继续运行。' }) }
async function checkDelivery() { await run(async () => { notice.value = await checkPendingSend(props.threadId) }) }
function clearUncertain() {
  if (window.confirm('请先核对最新历史和活动任务。确认已经核对，并自行决定下一条消息？')) { clearPendingSend(props.threadId); notice.value = '已清除待确认标记，没有自动发送消息。' }
}
let timer: ReturnType<typeof setInterval> | undefined
let generation = 0
let polling = false
watch(() => props.threadId, (threadId, previous) => {
  generation++; notice.value = ''; expanded.value = false; clearInterval(timer)
  if (previous && conversationStates[previous]?.proof) void releaseControl(previous).catch(() => undefined)
  if (!threadId) return
  setKnown(false)
  void refreshControl(threadId).then(() => { if (props.threadId === threadId) setKnown(true) }).catch((error) => { if (props.threadId === threadId) { notice.value = error.message; setKnown(false) } })
  const current = generation
  timer = setInterval(async () => {
    if (polling || busy.value || document.hidden || current !== generation) return
    polling = true
    try {
      if (conversationStates[threadId]?.proof) await heartbeatControl(threadId)
      else await refreshControl(threadId)
      if (current === generation) setKnown(true)
    } catch (error) {
      try { await refreshControl(threadId); if (current === generation) setKnown(true) } catch { if (current === generation) { notice.value = error instanceof Error ? error.message : '正在重新连接，请刷新。'; setKnown(false) } }
    } finally { polling = false }
  }, 5000)
}, { immediate: true })
onBeforeUnmount(() => { generation++; clearInterval(timer); window.removeEventListener('pointerdown', onOutsidePointer); window.removeEventListener('resize', placeMenu); window.removeEventListener('scroll', placeMenu, true); if (conversationStates[props.threadId]?.proof) void releaseControl(props.threadId).catch(() => undefined) })
</script>
<style scoped>
.control-bar { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: 100%; color: inherit; font-size: 0.75rem; }
.control-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; min-height: 28px; padding: 2px 0; line-height: 1.5; }
.control-toggle { display: grid; place-items: center; width: 26px; height: 26px; padding: 4px; opacity: 0; transition: opacity .12s, background .12s; border: 0; border-radius: 6px; }
.control-toggle svg { width: 16px; height: 16px; }
.control-bar:hover .control-toggle, .control-bar:focus-within .control-toggle, .control-bar[data-open='true'] .control-toggle { opacity: 1; }
.control-menu { position: fixed; z-index: 400; width: min(22rem, calc(100vw - 16px)); overflow-y: auto; padding: 5px; border: 1px solid #e4e4e7; border-radius: 9px; background: #fff; color: #3f3f46; font-size: .8125rem; box-shadow: 0 8px 25px #0002; animation: control-open .12s ease-out; }
:global(:root.dark .control-menu) { background: #202223; color: #e4e4e7; border-color: #52525b; }
@keyframes control-open { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
.control-dot { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: #a1a1aa; }
.control-dot.owned { background: #22c55e; } .control-dot.blocked { background: #eab308; }
.control-actions { display: flex; flex-direction: column; gap: 2px; }
button, .control-help > summary { border: 0; border-radius: 5px; padding: 7px 9px; color: inherit; background: transparent; cursor: pointer; font: inherit; text-align: left; }
.control-actions > button { width: 100%; }
button:disabled { opacity: .5; cursor: default; } button:hover:enabled { background: rgb(128 128 128 / 12%); }
.control-help { min-width: 0; width: 100%; } .control-help > summary { width: 100%; }
.control-help p, .control-notice { font-size: 0.8125rem; line-height: 1.65; margin: 6px 0 0; overflow-wrap: anywhere; }
.control-help button { display: block; width: 100%; margin-top: 4px; } .control-notice { color: inherit; padding: 0 9px; }
@media (max-width: 480px) { .control-bar { flex-basis: 100%; } .control-summary { min-height: 28px; } }
@media (hover: none) { .control-toggle { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .control-toggle { transition: none; } .control-menu { animation: none; } }
</style>
