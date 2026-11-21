import { reactive } from 'vue'
import { CodexApiError, extractErrorMessage } from './codexErrors'
export type Proof = { epoch: string; version: number; token: string }
export type ControlState = { threadId: string; epoch: string; version: number; revision?: number; owner: { id: string; label: string } | null; proof: Proof | null; activity: string; turnId: string | null; transferring: boolean; desktopReleaseAvailable: boolean; executionSource?: 'web' | 'desktop' }
type Client = { id: string; key: string }
export const conversationStates = reactive<Record<string, ControlState>>({})
export function applyControlState(state: ControlState) {
  const previous = conversationStates[state.threadId]
  if (previous?.epoch === state.epoch && (previous.version > state.version || (previous.version === state.version && (previous.revision ?? 0) > (state.revision ?? 0)))) return previous
  conversationStates[state.threadId] = state
  return state
}
let client: Client | null = null
let registering: Promise<Client> | null = null
const pendingKey = 'codex-web.pending-sends.v1'
export const pendingSendByThreadId = reactive<Record<string, { id: string; fingerprint: string }>>({})
let pendingLoaded = false
export function restorePendingSends() {
  if (!pendingLoaded) {
    pendingLoaded = true
    try {
      const saved = JSON.parse(sessionStorage.getItem(pendingKey) ?? '{}')
      for (const [id, value] of Object.entries(saved ?? {})) {
        const entry = value as { id?: unknown; fingerprint?: unknown } | null
        if (entry && typeof entry.id === 'string' && typeof entry.fingerprint === 'string') pendingSendByThreadId[id] = { id: entry.id, fingerprint: entry.fingerprint }
      }
    } catch { /* Keep in-memory protection if storage is unavailable. */ }
  }
  return pendingSendByThreadId
}
function savePending() { try { sessionStorage.setItem(pendingKey, JSON.stringify(pendingSendByThreadId)) } catch { /* Keep in-memory protection. */ } }
async function jsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.error) throw new CodexApiError(extractErrorMessage(body, '会话控制连接失败，请刷新核对。'), { code: body?.error?.code === 'control_client_expired' ? 'control_client_expired' : 'control_conflict' })
  return body.data as T
}
async function getClient() {
  if (client) return client
  registering ??= fetch('/codex-api/control/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? '手机网页' : '电脑网页' }) }).then(jsonResponse<Client>).then((value) => client = value).finally(() => { registering = null })
  return registering
}
export async function identityHeaders() {
  const value = await getClient()
  return { 'x-codex-client': value.id, 'x-codex-client-key': value.key }
}
function invalidateClient(id: string) {
  if (client?.id !== id) return
  client = null
  for (const threadId of Object.keys(conversationStates)) delete conversationStates[threadId]
}
async function controlRead<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const headers = await identityHeaders()
    try {
      return await jsonResponse<T>(await fetch(url, { headers, cache: 'no-store' }))
    } catch (error) {
      if (!(error instanceof CodexApiError) || error.code !== 'control_client_expired') throw error
      invalidateClient(headers['x-codex-client'])
      if (attempt) throw error
    }
  }
  throw new CodexApiError('网页控制连接未恢复，请重新检查。', { code: 'control_conflict' })
}
async function operation(route: string, threadId: string, extra: Record<string, unknown> = {}) {
  const state = conversationStates[threadId]
  const headers = { 'Content-Type': 'application/json', ...await identityHeaders(), 'x-codex-control': JSON.stringify(state?.proof ?? null) }
  try {
    const result = await jsonResponse<ControlState>(await fetch('/codex-api/control/' + route, { method: 'POST', headers, keepalive: route === 'release', body: JSON.stringify({ threadId, ...extra }) }))
    return applyControlState(result)
  } catch (error) {
    if (error instanceof CodexApiError && error.code === 'control_client_expired') invalidateClient(headers['x-codex-client'])
    throw error
  }
}
export async function refreshControl(threadId: string) {
  const state = await controlRead<ControlState>('/codex-api/control/state?threadId=' + encodeURIComponent(threadId))
  return applyControlState(state)
}
export async function claimControl(threadId: string, takeover = false, stop = false) {
  const state = await refreshControl(threadId)
  return operation('claim', threadId, { epoch: state.epoch, version: state.version, takeover, stop })
}
export async function heartbeatControl(threadId: string) { return operation('heartbeat', threadId) }
export async function releaseControl(threadId: string) { return operation('release', threadId) }
export async function recheckWriterControl(threadId: string) {
  await mutationHeaders(threadId)
  return operation('recheck', threadId)
}
export async function mutationHeaders(threadId: string, acquire = true) {
  let state = await refreshControl(threadId)
  if (!state.owner && acquire) state = await claimControl(threadId)
  if (!state.proof) throw new CodexApiError('此对话由另一个网页控制。请点击“接管并检查写入”，草稿不会自动发送。', { code: 'control_conflict' })
  return { ...await identityHeaders(), 'x-codex-control': JSON.stringify(state.proof) }
}
export function isControlledMutation(method: string) {
  return method.startsWith('turn/') || (method.startsWith('thread/') && !['thread/read', 'thread/list', 'thread/loaded/list', 'thread/goal/get'].includes(method)) || method === 'codexui/thread/release'
}
export async function rpcControlHeaders(method: string, params: unknown) {
  if (!isControlledMutation(method)) return {}
  const threadId = (params as { threadId?: string } | null)?.threadId
  return threadId ? mutationHeaders(threadId) : identityHeaders()
}
export async function sendRequestId(threadId: string, params: unknown) {
  const pending = restorePendingSends()
  if (pending[threadId]) {
    const checked = await resolvePendingSend(threadId)
    if (checked.state !== 'rejected') throw new CodexApiError(checked.message, { code: 'delivery_uncertain' })
  }
  const bytes = new TextEncoder().encode(JSON.stringify(params))
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((v) => v.toString(16).padStart(2, '0')).join('')
  if (pending[threadId]) throw new CodexApiError('上一条消息发送结果尚待确认。请点击“发送待确认 · 核对”，避免重复执行。', { code: 'delivery_uncertain' })
  const value = { id: crypto.randomUUID(), fingerprint }
  pending[threadId] = value; savePending()
  return value.id
}
export function clearPendingSend(threadId: string, expectedId?: string) {
  const pending = restorePendingSends()
  if (expectedId && pending[threadId]?.id !== expectedId) return
  delete pending[threadId]; savePending()
}
async function resolvePendingSend(threadId: string) {
  const pending = restorePendingSends()[threadId]
  if (!pending) return { state: 'none', message: '没有待确认的发送。' }
  const receipt = await controlRead<{ state: string } | null>('/codex-api/control/receipt?id=' + encodeURIComponent(pending.id))
  if (pendingSendByThreadId[threadId]?.id !== pending.id) return { state: 'changed', message: '发送状态已改变，请重新核对。' }
  if (receipt?.state === 'completed') { clearPendingSend(threadId, pending.id); return { state: 'completed', message: '上一条已确认发送。本次没有重发，请先查看最新历史，再决定下一条消息。' } }
  if (receipt?.state === 'rejected') { clearPendingSend(threadId, pending.id); return { state: 'rejected', message: '上一条已确认未被接受，可以手动重新发送。' } }
  return { state: 'pending', message: receipt ? '结果仍待确认。请核对最新历史；取得控制权不会清除这条发送记录，也不会自动重发。' : '当前登录下未找到这条回执，不能据此认定未发送。请核对历史后，再明确清除待确认标记。' }
}
export async function checkPendingSend(threadId: string) { return (await resolvePendingSend(threadId)).message }
