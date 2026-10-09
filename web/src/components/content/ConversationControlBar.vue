<template>
  <aside class="control-bar" aria-label="会话控制" :aria-busy="busy">
    <div class="control-summary" role="status">
      <span class="control-dot" :class="{ owned: state?.proof, blocked: state?.activity === 'external' }" />
      <span>{{ label }}</span>
    </div>
    <div class="control-actions">
      <button v-if="!state?.proof && state?.activity !== 'external'" :disabled="busy || !state" @click="takeover(false)">{{ state?.owner ? '接管此对话' : '取得控制权' }}</button>
      <button v-if="state?.turnId && ['running', 'approval'].includes(state.activity)" :disabled="busy" @click="takeover(true)">停止任务并接管</button>
      <button v-if="state?.proof" :disabled="busy" @click="leave">退出控制</button>
      <button :disabled="busy" @click="refresh">刷新状态</button>
      <details>
        <summary>交接说明</summary>
        <p>接管网页控制后，当前任务继续运行。旧网页只能查看；两端草稿不会自动发送。退出、断线或后台超过 30 秒后，其他网页可取得控制，任务继续。</p>
        <p>接管或服务重启后，原待发送队列暂停，请编辑后明确重新排队或手动发送。</p>
        <p>桌面远程释放暂不可用。桌面占用时，请在桌面结束任务并释放会话，再点“重试原对话”。本程序不会结束整个 Codex 进程。</p>
        <button disabled title="尚无经过验证的桌面原生会话控制接口">释放桌面会话（暂不可用）</button>
        <button :disabled="busy" @click="checkDelivery">核对发送结果</button>
        <button :disabled="busy" @click="clearUncertain">已核对历史，清除待确认标记</button>
      </details>
    </div>
    <p v-if="notice" class="control-notice" role="status">{{ notice }}</p>
  </aside>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { conversationStates, refreshControl, claimControl, releaseControl, heartbeatControl, checkPendingSend, clearPendingSend } from '../../api/conversationControl'
const props = defineProps<{ threadId: string }>()
const emit = defineEmits<{ acquired: [] }>()
const busy = ref(false)
const notice = ref('')
const state = computed(() => conversationStates[props.threadId])
const label = computed(() => {
  const value = state.value
  if (!value) return '正在确认会话控制状态…'
  if (value.transferring) return '正在交接，请稍候'
  if (value.activity === 'external') return '桌面或其他后台占用 · 远程释放暂不可用'
  const owner = value.proof ? '本网页控制' : value.owner ? `其他${value.owner.label}控制 · 当前只读` : '尚未接管 · 可查看历史'
  return owner + (value.activity === 'running' ? ' · 任务运行中' : value.activity === 'approval' ? ' · 等待审批' : '')
})
async function run(action: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true; notice.value = ''
  try { await action() } catch (error) { notice.value = error instanceof Error ? error.message : '连接失败，请刷新状态。' } finally { busy.value = false }
}
async function refresh() { await run(() => refreshControl(props.threadId)) }
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
  generation++; notice.value = ''; clearInterval(timer)
  if (previous && conversationStates[previous]?.proof) void releaseControl(previous).catch(() => undefined)
  if (!threadId) return
  void refreshControl(threadId).catch((error) => { if (props.threadId === threadId) notice.value = error.message })
  const current = generation
  timer = setInterval(async () => {
    if (polling || busy.value || document.hidden || current !== generation) return
    polling = true
    try {
      if (conversationStates[threadId]?.proof) await heartbeatControl(threadId)
      else await refreshControl(threadId)
    } catch (error) {
      try { await refreshControl(threadId) } catch { notice.value = error instanceof Error ? error.message : '正在重新连接，请刷新。' }
    } finally { polling = false }
  }, 5000)
}, { immediate: true })
onBeforeUnmount(() => { generation++; clearInterval(timer); if (conversationStates[props.threadId]?.proof) void releaseControl(props.threadId).catch(() => undefined) })
</script>
<style scoped>
.control-bar { flex-shrink: 0; margin: 6px 16px 10px; padding: 10px 12px; border: 1px solid rgb(128 128 128 / 30%); border-radius: 12px; color: inherit; font-size: 12px; background: rgb(128 128 128 / 6%); }
.control-summary { display: flex; align-items: center; gap: 7px; line-height: 1.5; }
.control-dot { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: #a1a1aa; }
.control-dot.owned { background: #22c55e; } .control-dot.blocked { background: #eab308; }
.control-actions { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
button, summary { border: 1px solid rgb(128 128 128 / 30%); border-radius: 7px; padding: 5px 8px; color: inherit; background: transparent; cursor: pointer; font: inherit; }
button:disabled { opacity: .5; cursor: default; } button:hover:enabled { background: rgb(128 128 128 / 12%); }
details { min-width: 0; flex: 1; } summary { width: max-content; } details[open] { flex-basis: 100%; }
details p, .control-notice { line-height: 1.65; margin: 8px 0 0; overflow-wrap: anywhere; }
details button { margin: 8px 6px 0 0; } .control-notice { color: inherit; }
@media (max-width: 480px) { .control-bar { margin: 4px 10px 8px; padding: 8px 10px; } }
</style>
