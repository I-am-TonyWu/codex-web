import { createConnection, type Socket } from 'node:net'
import { randomUUID } from 'node:crypto'
import { ControlError } from './conversationControl.js'

type Row = Record<string, any>
type Event = { method: string; params: unknown }
const row = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {}
const MAX_FRAME = 64 * 1024 * 1024
const versions: Record<string, number> = {
  initialize: 0, 'thread-owner-discovery': 1, 'thread-follower-read-model-settings': 1,
  'thread-follower-start-turn': 2, 'thread-follower-interrupt-turn': 4,
  'thread-follower-command-approval-decision': 1, 'thread-follower-file-approval-decision': 1,
  'thread-follower-permissions-request-approval-response': 1,
  'thread-follower-submit-user-input': 1, 'thread-follower-submit-mcp-server-elicitation-response': 1,
}

/** Same-user desktop coordination. No executor identity, process termination or lock-file deletion. */
export class DesktopIpcClient {
  private socket: Socket | null = null
  private connecting: Promise<void> | null = null
  private buffer = Buffer.alloc(0)
  private clientId = 'initializing-client'
  private pending = new Map<string, { resolve: (v: Row) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  onBroadcast: (event: Row) => void = () => {}
  onDisconnect: () => void = () => {}
  constructor(private readonly endpoint = process.env.CODEXUI_DESKTOP_IPC_ENDPOINT ?? '\\\\.\\pipe\\codex-ipc') {}
  async connect() {
    if (this.socket && this.clientId !== 'initializing-client') return
    if (this.connecting) return this.connecting
    this.connecting = (async () => {
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection(this.endpoint)
        this.socket = socket
        const timer = setTimeout(() => { socket.destroy(); reject(new Error('desktop-ipc-connect-timeout')) }, 2500)
        socket.on('data', data => { try { this.receive(data) } catch { socket.destroy() } })
        socket.on('error', error => { clearTimeout(timer); reject(error) })
        socket.on('close', () => {
          clearTimeout(timer)
          if (this.socket !== socket) return
          this.socket = null; this.clientId = 'initializing-client'; this.buffer = Buffer.alloc(0)
          for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('desktop-ipc-disconnected; delivery may be unconfirmed')) }
          this.pending.clear(); this.onDisconnect()
        })
        socket.once('connect', () => { clearTimeout(timer); resolve() })
      })
      const result = await this.request('initialize', { clientType: 'codex-web' })
      if (typeof result.result?.clientId !== 'string') throw new Error('desktop-ipc-initialize-invalid')
      this.clientId = result.result.clientId
    })().catch(error => { this.socket?.destroy(); throw error }).finally(() => { this.connecting = null })
    return this.connecting
  }
  private write(message: Row) {
    if (!this.socket?.writable) throw new Error('desktop-ipc-not-connected')
    const body = Buffer.from(JSON.stringify(message)); if (body.length > MAX_FRAME) throw new Error('desktop-ipc-frame-too-large')
    const header = Buffer.alloc(4); header.writeUInt32LE(body.length); this.socket.write(Buffer.concat([header, body]))
  }
  private receive(data: Buffer) {
    this.buffer = Buffer.concat([this.buffer, data])
    while (this.buffer.length >= 4) {
      const size = this.buffer.readUInt32LE(0)
      if (!size || size > MAX_FRAME) throw new Error('desktop-ipc-invalid-frame')
      if (this.buffer.length < 4 + size) return
      const event = row(JSON.parse(this.buffer.subarray(4, 4 + size).toString('utf8')))
      this.buffer = this.buffer.subarray(4 + size)
      if (event.type === 'response') {
        const pending = this.pending.get(event.requestId)
        if (!pending) continue
        this.pending.delete(event.requestId); clearTimeout(pending.timer)
        if (event.resultType === 'success') pending.resolve(event)
        else pending.reject(new Error(`desktop-ipc: ${String(event.error)}`))
      } else if (event.type === 'client-discovery-request') {
        this.write({ type: 'client-discovery-response', requestId: event.requestId, response: { canHandle: false } })
      } else if (event.type === 'broadcast') this.onBroadcast(event)
    }
  }
  request(method: string, params: Row, targetClientId?: string, timeoutMs = 5000): Promise<Row> {
    if (!(method in versions)) return Promise.reject(new Error('desktop-ipc-method-not-supported'))
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('desktop-ipc-request-timeout; delivery may be unconfirmed')) }, timeoutMs + 500)
      this.pending.set(requestId, { resolve, reject, timer })
      try { this.write({ type: 'request', requestId, sourceClientId: this.clientId, version: versions[method], method, params, targetClientId, timeoutMs }) }
      catch (error) { this.pending.delete(requestId); clearTimeout(timer); reject(error as Error) }
    })
  }
  follow(threadId: string, owner: string, following: boolean) {
    this.write({ type: 'broadcast', method: 'thread-stream-following-changed', sourceClientId: this.clientId,
      targetClientIds: [owner], version: 1, params: { hostId: 'local', conversationId: threadId, following } })
  }
  close() { this.socket?.destroy() }
}

type Attached = { owner: string; state: Row | null; revision: number; previousTurns: Row[]; touchedAt: number; submission?: { turnId: string | null; previousIds: string[] }; timer?: ReturnType<typeof setTimeout> }
type PendingApproval = { id: number; method: string; params: Row; receivedAtIso: string; originalId: unknown; owner: string; threadId: string; nativeMethod: string }

export function desktopTurns(state: Row): Row[] {
  const history = row(row(state.turnHistory).history)
  const entities = row(history.entitiesByKey)
  const source: Row[] = state.turnHistory?.kind === 'canonical'
    ? (Array.isArray(history.islands) ? history.islands : []).flatMap(island => (island.entries ?? []).map((entry: Row) => entities[entry.value]).filter(Boolean))
    : Array.isArray(state.turns) ? state.turns : []
  return source.filter(t => typeof t.turnId === 'string').map(t => ({
    id: t.turnId, status: t.status, error: t.error ?? null, items: Array.isArray(t.items) ? t.items : [],
  }))
}

/** Apply only ordinary JSON patches. Reject prototype access and invalid paths before mutation. */
export function applyDesktopPatches(state: Row, patches: unknown): Row {
  if (!Array.isArray(patches)) throw new Error('desktop-invalid-patches')
  const next = structuredClone(state)
  for (const patch of patches) {
    if (!Array.isArray(patch.path) || !['add', 'replace', 'remove'].includes(patch.op)) throw new Error('desktop-invalid-patch')
    const path = patch.path as Array<string | number>
    if (!path.length || path.some(key => !['string', 'number'].includes(typeof key) || ['__proto__', 'constructor', 'prototype'].includes(String(key)))) throw new Error('desktop-invalid-patch-path')
    let parent: any = next
    for (const key of path.slice(0, -1)) {
      if (!parent || typeof parent !== 'object' || !Object.prototype.hasOwnProperty.call(parent, key)) throw new Error('desktop-missing-patch-path')
      parent = parent[key]
    }
    const key = path[path.length - 1]!
    if (!parent || typeof parent !== 'object') throw new Error('desktop-invalid-patch-parent')
    if (Array.isArray(parent) && key !== 'length') {
      const index = Number(key)
      if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new Error('desktop-invalid-array-index')
      if (patch.op === 'add') parent.splice(index, 0, patch.value)
      else if (patch.op === 'remove') parent.splice(index, 1)
      else parent[index] = patch.value
    } else if (patch.op === 'remove') delete parent[key]
    else parent[key] = patch.value
  }
  return next
}

export class DesktopThreadBridge {
  private attached = new Map<string, Attached>()
  private approvals = new Map<string, PendingApproval>()
  private nextApprovalId = -1
  private idleTimer: ReturnType<typeof setInterval>
  constructor(private emit: (event: Event) => void, private readonly ipc = new DesktopIpcClient(), private readonly enabled = process.platform === 'win32' && !process.env.CODEXUI_DISABLE_DESKTOP_BRIDGE) {
    ipc.onBroadcast = event => this.receive(event)
    ipc.onDisconnect = () => {
      for (const [threadId, attached] of this.attached) {
        attached.state = null; clearTimeout(attached.timer)
        this.emit({ method: 'web/thread/desktopDisconnected', params: { threadId } })
      }
    }
    this.idleTimer = setInterval(() => {
      for (const [id, attached] of this.attached) {
        const state = attached.state
        if (Date.now() - attached.touchedAt > 60_000 && state && !attached.submission && ['idle', 'systemError'].includes(state.threadRuntimeStatus?.type) && !state.requests?.length && !desktopTurns(state).some(t => t.status === 'inProgress')) {
          this.detach(id); this.emit({ method: 'web/thread/desktopDetached', params: { threadId: id } })
        }
      }
    }, 5000)
    this.idleTimer.unref?.()
  }
  has(threadId: string) { return this.attached.has(threadId) }
  connected(threadId: string) { return !!this.attached.get(threadId)?.state }
  async attach(threadId: string): Promise<boolean> {
    if (!this.enabled) return false
    if (this.connected(threadId)) { this.attached.get(threadId)!.touchedAt = Date.now(); return true }
    if (this.attached.size >= 64 && !this.has(threadId)) return false
    try {
      await this.ipc.connect()
      const discovery = await this.ipc.request('thread-owner-discovery', { hostId: 'local', conversationId: threadId })
      if (!discovery.result?.supportsUntrustedAppInput || typeof discovery.handledByClientId !== 'string') return false
      const owner = discovery.handledByClientId
      const settings = await this.ipc.request('thread-follower-read-model-settings', { conversationId: threadId }, owner)
      if (settings.result?.settings?.resumeState !== 'resumed') return false
      const attached: Attached = { owner, state: null, revision: -1, previousTurns: [], touchedAt: Date.now() }
      this.attached.set(threadId, attached); this.ipc.follow(threadId, owner, true)
      const deadline = Date.now() + 2500
      while (!attached.state && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25))
      if (!attached.state) { this.detach(threadId); return false }
      return true
    } catch { this.detach(threadId); return false }
  }
  private receive(event: Row) {
    if (event.method === 'client-status-changed' && event.params?.status === 'disconnected') {
      for (const [threadId, attached] of this.attached) if (attached.owner === event.params.clientId) {
        attached.state = null; clearTimeout(attached.timer); attached.timer = undefined
        this.emit({ method: 'web/thread/desktopDisconnected', params: { threadId } })
      }
      return
    }
    const params = row(event.params), threadId = params.conversationId
    const attached = this.attached.get(threadId)
    if (!attached || event.sourceClientId !== attached.owner || params.hostId !== 'local') return
    if (event.method === 'thread-stream-following-status-requested') { this.ipc.follow(threadId, attached.owner, true); return }
    if (event.method !== 'thread-stream-state-changed') return
    const change = row(params.change)
    try {
      if (event.version !== 11) throw new Error('desktop-incompatible-stream-version')
      const firstSnapshot = attached.revision < 0
      if (change.type === 'snapshot') {
        if (change.conversationState?.id !== threadId || !Number.isInteger(change.revision)) throw new Error('desktop-invalid-snapshot')
        if (change.revision < attached.revision) return
        attached.state = change.conversationState
      } else if (change.type === 'patches') {
        if (change.revision <= attached.revision) return
        if (!attached.state || change.baseRevision !== attached.revision) throw new Error('desktop-stream-revision-gap')
        attached.state = applyDesktopPatches(attached.state, change.patches)
      } else throw new Error('desktop-invalid-stream-change')
      attached.revision = change.revision
      if (attached.submission) {
        const submitted = attached.submission, turns = desktopTurns(attached.state!)
        if (turns.some(t => submitted.turnId ? t.id === submitted.turnId : !submitted.previousIds.includes(t.id))) attached.submission = undefined
      }
      if (firstSnapshot) attached.previousTurns = structuredClone(desktopTurns(attached.state!))
      this.syncApprovals(threadId, attached)
      if (!attached.timer) attached.timer = setTimeout(() => { attached.timer = undefined; this.publish(threadId, attached) }, 100)
    } catch {
      attached.state = null; clearTimeout(attached.timer); attached.timer = undefined
      this.emit({ method: 'web/thread/desktopDisconnected', params: { threadId } })
    }
  }
  snapshot(threadId: string): Row | null {
    const attached = this.attached.get(threadId), state = attached?.state
    if (!state) return null
    const turns = desktopTurns(state)
    return { thread: { id: threadId, name: state.title, cwd: state.cwd, path: state.rolloutPath,
      model: state.latestModel, modelProvider: state.modelProvider, status: attached?.submission ? { type: 'active', activeFlags: [] } : state.threadRuntimeStatus,
      createdAt: state.createdAt / 1000, updatedAt: state.updatedAt / 1000, turns,
    }, model: state.latestModel, modelProvider: state.modelProvider, webExecutionSource: 'desktop' }
  }
  mergeRead(threadId: string, disk: unknown): unknown {
    const live = this.snapshot(threadId)
    if (!live) return disk
    this.attached.get(threadId)!.touchedAt = Date.now()
    const result = row(disk), previous = row(result.thread), byId = new Map<string, Row>()
    for (const turn of [...(Array.isArray(previous.turns) ? previous.turns : []), ...live.thread.turns]) byId.set(turn.id, turn)
    return { ...result, ...live, thread: { ...previous, ...live.thread, turns: [...byId.values()] } }
  }
  private publish(threadId: string, attached: Attached) {
    if (!attached.state) return
    const current = desktopTurns(attached.state), previous = new Map(attached.previousTurns.map(t => [t.id, t]))
    for (const turn of current) {
      const old = previous.get(turn.id)
      if (!old) this.emit({ method: 'turn/started', params: { threadId, turn: { ...turn, items: [] } } })
      const oldItems = new Map((old?.items ?? []).map((item: Row) => [item.id, item]))
      for (const item of turn.items) {
        const before = oldItems.get(item.id) as Row | undefined
        if (JSON.stringify(item) === JSON.stringify(before)) continue
        if (item.type === 'reasoning') {
          for (const [summaryIndex, text] of (item.summary ?? []).entries()) {
            const oldText = before?.summary?.[summaryIndex] ?? ''
            if (typeof text === 'string' && text.startsWith(oldText) && text.length > oldText.length) this.emit({ method: 'item/reasoning/summaryTextDelta', params: { threadId, turnId: turn.id, itemId: item.id, summaryIndex, delta: text.slice(oldText.length) } })
          }
        }
        this.emit({ method: item.status === 'inProgress' ? 'item/started' : 'item/completed', params: { threadId, turnId: turn.id, item } })
      }
      if (turn.status !== 'inProgress' && (!old || old.status === 'inProgress')) this.emit({ method: 'turn/completed', params: { threadId, turn } })
    }
    attached.previousTurns = structuredClone(current)
    this.emit({ method: 'web/thread/desktopUpdated', params: { threadId, status: attached.submission ? { type: 'active', activeFlags: [] } : attached.state.threadRuntimeStatus,
      turnId: attached.submission?.turnId ?? current.find(t => t.status === 'inProgress')?.id ?? null, executionSource: 'desktop' } })
  }
  private syncApprovals(threadId: string, attached: Attached) {
    const requests = attached.state?.requests ?? [], present = new Set<string>()
    const methods: Record<string, string> = {
      'item/commandExecution/requestApproval': 'thread-follower-command-approval-decision',
      'item/fileChange/requestApproval': 'thread-follower-file-approval-decision',
      'item/permissions/requestApproval': 'thread-follower-permissions-request-approval-response',
      'item/tool/requestUserInput': 'thread-follower-submit-user-input',
      'mcpServer/elicitation/request': 'thread-follower-submit-mcp-server-elicitation-response',
    }
    for (const request of requests) {
      const nativeMethod = methods[request.method]; if (!nativeMethod) continue
      const key = `${threadId}:${JSON.stringify(request.id)}`; present.add(key)
      const previous = this.approvals.get(key)
      if (previous?.owner === attached.owner) continue
      if (previous) this.emit({ method: 'server/request/resolved', params: { id: previous.id, threadId, method: previous.method } })
      const approval = { id: this.nextApprovalId--, method: request.method, params: { ...request.params, threadId }, receivedAtIso: new Date().toISOString(), originalId: request.id, threadId, owner: attached.owner, nativeMethod }
      this.approvals.set(key, approval)
      this.emit({ method: 'server/request', params: { id: approval.id, method: approval.method, params: approval.params, receivedAtIso: approval.receivedAtIso } })
    }
    for (const [key, request] of this.approvals) if (request.threadId === threadId && !present.has(key)) {
      this.approvals.delete(key); this.emit({ method: 'server/request/resolved', params: { id: request.id, threadId, method: request.method } })
    }
  }
  listPending() { return [...this.approvals.values()].map(({ id, method, params, receivedAtIso }) => ({ id, method, params, receivedAtIso })) }
  async respond(id: number, result: unknown) {
    const approval = [...this.approvals.values()].find(v => v.id === id)
    if (!approval || !this.connected(approval.threadId)) throw new Error('desktop-approval-no-longer-available')
    const response = row(result), params: Row = { conversationId: approval.threadId, requestId: approval.originalId }
    if (approval.nativeMethod.endsWith('-decision')) params.decision = response.decision
    else params.response = result
    await this.ipc.request(approval.nativeMethod, params, approval.owner)
  }
  async rpc(threadId: string, method: string, params: Row): Promise<unknown> {
    if (method === 'thread/resume' && !this.connected(threadId)) await this.attach(threadId)
    const attached = this.attached.get(threadId)
    if (!attached?.state) throw new ControlError('desktop_bridge_unavailable', '桌面后台连接已断开。请重新检查会话状态；消息不会自动重复发送。')
    attached.touchedAt = Date.now()
    if (method === 'thread/resume') return this.snapshot(threadId)
    if (method === 'turn/start') {
      const state = attached.state
      if (attached.submission || state.threadRuntimeStatus?.type === 'active' || desktopTurns(state).some(t => t.status === 'inProgress') || state.requests?.length || state.unconfirmedTurnSubmissions?.length || state.queuedMessages?.length || state.threadGoal?.status === 'active') throw new ControlError('desktop_thread_busy', '此对话仍有任务、审批或待发送消息。请等待完成，或明确停止任务后再发送。')
      const cwd = typeof state.cwd === 'string' ? state.cwd : ''
      if (!cwd) throw new ControlError('desktop_bridge_unavailable', '桌面会话缺少工作目录，不能安全发送。')
      const request = { ...params, clientUserMessageId: randomUUID(), approvalPolicy: 'on-request', approvalsReviewer: 'user', permissions: null,
        sandboxPolicy: { type: 'workspaceWrite', writableRoots: [cwd], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false } }
      attached.submission = { turnId: null, previousIds: desktopTurns(state).map(t => t.id) }
      const response = await this.ipc.request('thread-follower-start-turn', { conversationId: threadId, turnStart: { request,
        context: { inheritThreadSettings: false, useAppServerPermissionDefault: false, usePermissionSelection: false, attachments: params.attachments ?? [] } } }, attached.owner, 60_000)
      const result = response.result?.result
      if (typeof result?.turn?.id !== 'string') throw new ControlError('delivery_uncertain', '桌面后台已接收请求，但返回的执行编号不完整。请核对历史后再操作，不会自动重发。')
      if (attached.submission) {
        if (result.turn.status !== 'inProgress' || desktopTurns(attached.state ?? {}).some(t => t.id === result.turn.id)) attached.submission = undefined
        else attached.submission.turnId = result.turn.id
      }
      this.publish(threadId, attached)
      return result
    }
    if (method === 'turn/interrupt') {
      const result = await this.ipc.request('thread-follower-interrupt-turn', { conversationId: threadId, mode: 'user-stop', expectedTurnId: params.turnId }, attached.owner)
      return result.result
    }
    throw new ControlError('desktop_operation_unsupported', '此操作暂不能通过桌面协同通道执行。请在客户端操作或先正常释放会话；草稿已保留。')
  }
  detach(threadId: string) {
    const attached = this.attached.get(threadId); if (!attached) return
    clearTimeout(attached.timer)
    try { this.ipc.follow(threadId, attached.owner, false) } catch { /* already disconnected */ }
    this.attached.delete(threadId)
    for (const [key, approval] of this.approvals) if (approval.threadId === threadId) {
      this.approvals.delete(key); this.emit({ method: 'server/request/resolved', params: { id: approval.id, threadId, method: approval.method } })
    }
  }
  close() { clearInterval(this.idleTimer); for (const id of this.attached.keys()) this.detach(id); this.ipc.close() }
}
