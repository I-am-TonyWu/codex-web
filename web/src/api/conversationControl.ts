import { reactive } from 'vue'
import { CodexApiError, extractErrorMessage } from './codexErrors'
export type Proof = { epoch: string; version: number; token: string }
export type ControlState = { threadId: string; epoch: string; version: number; revision?: number; owner: { id: string; label: string } | null; proof: Proof | null; activity: string; turnId: string | null; transferring: boolean; desktopReleaseAvailable: boolean }
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
function pendingSends(): Record<string, { id: string; fingerprint: string }> {
  try { return JSON.parse(sessionStorage.getItem(pendingKey) ?? '{}') } catch { return {} }
}
function savePending(value: Record<string, { id: string; fingerprint: string }>) { try { sessionStorage.setItem(pendingKey, JSON.stringify(value)) } catch { /* in-memory HTTP dedupe remains */ } }
async function jsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.error) throw new CodexApiError(extractErrorMessage(body, '会话控制连接失败，请刷新核对。'), { code: 'control_conflict' })
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
async function operation(route: string, threadId: string, extra: Record<string, unknown> = {}) {
  const state = conversationStates[threadId]
  const headers = { 'Content-Type': 'application/json', ...await identityHeaders(), 'x-codex-control': JSON.stringify(state?.proof ?? null) }
  const result = await jsonResponse<ControlState>(await fetch('/codex-api/control/' + route, { method: 'POST', headers, keepalive: route === 'release', body: JSON.stringify({ threadId, ...extra }) }))
  return applyControlState(result)
}
export async function refreshControl(threadId: string) {
  const state = await jsonResponse<ControlState>(await fetch('/codex-api/control/state?threadId=' + encodeURIComponent(threadId), { headers: await identityHeaders(), cache: 'no-store' }))
  return applyControlState(state)
}
export async function claimControl(threadId: string, takeover = false, stop = false) {
  const state = conversationStates[threadId] ?? await refreshControl(threadId)
  return operation('claim', threadId, { epoch: state.epoch, version: state.version, takeover, stop })
}
export async function heartbeatControl(threadId: string) { return operation('heartbeat', threadId) }
export async function releaseControl(threadId: string) { return operation('release', threadId) }
export async function recheckWriterControl(threadId: string) {
  await mutationHeaders(threadId)
  return operation('recheck', threadId)
}
export async function mutationHeaders(threadId: string, acquire = true) {
  let state = conversationStates[threadId] ?? await refreshControl(threadId)
  if (!state.owner && acquire) state = await claimControl(threadId)
  if (!state.proof) throw new CodexApiError('此对话由另一个网页控制。请点击“接管此对话”，草稿不会自动发送。', { code: 'control_conflict' })
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
  const bytes = new TextEncoder().encode(JSON.stringify(params))
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((v) => v.toString(16).padStart(2, '0')).join('')
  const pending = pendingSends()
  if (pending[threadId]) throw new CodexApiError('上一条消息发送结果尚待确认。请在会话控制栏“核对发送结果”，避免重复执行。', { code: 'delivery_uncertain' })
  const value = { id: crypto.randomUUID(), fingerprint }
  pending[threadId] = value; savePending(pending)
  return value.id
}
export function clearPendingSend(threadId: string) { const pending = pendingSends(); delete pending[threadId]; savePending(pending) }
export async function checkPendingSend(threadId: string) {
  const pending = pendingSends()[threadId]
  if (!pending) return '没有待确认的发送。'
  const receipt = await jsonResponse<{ state: string } | null>(await fetch('/codex-api/control/receipt?id=' + encodeURIComponent(pending.id), { headers: await identityHeaders(), cache: 'no-store' }))
  if (receipt?.state === 'completed') { clearPendingSend(threadId); return '上一条已确认发送，请刷新历史查看结果；不会重复发送。' }
  if (receipt?.state === 'rejected') { clearPendingSend(threadId); return '上一条未被接受，可以手动重新发送。' }
  return '结果仍无法确认。请核对最新历史，确认没有重复任务后，再清除待确认标记。'
}
