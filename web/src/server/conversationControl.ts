import { createHash, randomUUID, randomBytes } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export class ControlError extends Error {
  constructor(public readonly code: string, message: string) { super(message) }
}
export type ControlClient = { id: string; key: string; scope: string; label: string }
export type ControlProof = { epoch: string; version: number; token: string }
type Entry = { version: number; revision: number; owner: ControlClient | null; token: string; heartbeat: number; activity: string; turnId: string | null; transferring: boolean; completedTurnId: string | null }
type Receipt = { id: string; scope: string; threadId: string; hash: string; state: 'pending' | 'completed' | 'rejected'; result?: unknown; at: number }
const reject = (message = '此对话的控制权已改变。请查看最新状态，并明确点击“接管此对话”。消息未发送。'): never => { throw new ControlError('control_conflict', message) }

/** Browser control is independent of the OS writer lock. Never kill a desktop process here. */
export class ConversationControl {
  readonly epoch = randomUUID()
  private readonly clients = new Map<string, ControlClient>()
  private readonly entries = new Map<string, Entry>()
  private readonly tails = new Map<string, Promise<unknown>>()
  private readonly receipts = new Map<string, Receipt>()
  private ready: Promise<void> | null = null
  private logTail: Promise<void> = Promise.resolve()
  constructor(private readonly ledgerPath: string, private readonly now = Date.now, private readonly leaseMs = 30_000) {}

  register(scope: string, label: string): ControlClient {
    if (this.clients.size >= 512) throw new ControlError('control_capacity', '终端过多，请重启网页服务后重连。')
    const client = { id: randomUUID(), key: randomBytes(32).toString('hex'), scope, label: label.slice(0, 40) || '网页终端' }
    this.clients.set(client.id, client)
    return client
  }
  authenticate(id: string, key: string, scope: string): ControlClient {
    const client = this.clients.get(id)
    if (!client || client.key !== key || client.scope !== scope) throw new ControlError('control_client_expired', '网页服务已重启或登录身份已改变，请刷新页面重新连接。')
    return client
  }
  private entry(threadId: string): Entry {
    if (!threadId || threadId.length > 200) throw new ControlError('control_invalid', '无效的对话 ID。')
    let entry = this.entries.get(threadId)
    if (!entry) {
      if (this.entries.size >= 4096) throw new ControlError('control_capacity', '会话控制容量已满，请重启网页服务。')
      entry = { version: 0, revision: 0, owner: null, token: '', heartbeat: 0, activity: 'unknown', turnId: null, transferring: false, completedTurnId: null }
      this.entries.set(threadId, entry)
    }
    if (entry.owner && !entry.transferring && this.now() - entry.heartbeat >= this.leaseMs) {
      entry.owner = null; entry.token = ''; entry.version++
    }
    return entry
  }
  status(threadId: string, client: ControlClient) {
    const e = this.entry(threadId)
    return { threadId, epoch: this.epoch, version: e.version, revision: e.revision, owner: e.owner ? { id: e.owner.id, label: e.owner.label } : null,
      activity: e.activity, turnId: e.turnId, transferring: e.transferring, desktopReleaseAvailable: false,
      proof: e.owner?.id === client.id ? { epoch: this.epoch, version: e.version, token: e.token } : null }
  }
  serial<T>(threadId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(threadId) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(action)
    this.tails.set(threadId, next)
    void next.finally(() => { if (this.tails.get(threadId) === next) this.tails.delete(threadId) }).catch(() => undefined)
    return next
  }
  async claim(threadId: string, client: ControlClient, epoch: string, version: number, takeover: boolean,
    stop?: () => Promise<void>) {
    return this.serial(threadId, async () => {
      const e = this.entry(threadId)
      if (epoch !== this.epoch || version !== e.version) reject()
      if (e.owner && e.owner.id !== client.id && !takeover) reject()
      if (stop) {
        e.transferring = true; e.revision++
        try { await stop() } catch (error) { e.activity = 'unknown'; throw error } finally { e.transferring = false; e.revision++ }
      }
      e.version++; e.owner = client; e.token = randomBytes(32).toString('hex'); e.heartbeat = this.now()
      return this.status(threadId, client)
    })
  }
  private verify(threadId: string, client: ControlClient, proof: ControlProof | null): Entry {
    const e = this.entry(threadId)
    if (!proof || proof.epoch !== this.epoch || proof.version !== e.version || proof.token !== e.token || e.owner?.id !== client.id) reject()
    return e
  }
  heartbeat(threadId: string, client: ControlClient, proof: ControlProof | null) {
    this.verify(threadId, client, proof).heartbeat = this.now()
    return this.status(threadId, client)
  }
  async release(threadId: string, client: ControlClient, proof: ControlProof | null, releaseIdle: () => Promise<unknown>) {
    return this.serial(threadId, async () => {
      const e = this.verify(threadId, client, proof)
      e.owner = null; e.token = ''; e.version++
      // Active tasks and pending approvals keep running. Only release our own idle writer.
      if (e.activity !== 'running' && e.activity !== 'approval') await releaseIdle()
      return this.status(threadId, client)
    })
  }
  async mutate<T>(threadId: string, client: ControlClient, proof: ControlProof | null, action: () => Promise<T>, touch = true) {
    return this.serial(threadId, async () => { const e = this.verify(threadId, client, proof); if (touch) e.heartbeat = this.now(); return action() })
  }
  activity(threadId: string, activity: string, turnId: string | null = null) {
    const e = this.entry(threadId)
    if (activity === 'running' && turnId && e.completedTurnId === turnId) return
    if (activity === 'idle' && turnId) e.completedTurnId = turnId
    e.revision++
    e.activity = activity
    e.turnId = activity === 'idle' ? null : (activity === 'approval' || activity === 'running') && !turnId ? e.turnId : turnId
  }
  private loadReceipts() {
    return this.ready ??= readFile(this.ledgerPath, 'utf8').then((text) => {
      for (const line of text.split('\n')) {
        try { const receipt = JSON.parse(line) as Receipt; if (receipt.id && receipt.at > this.now() - 30 * 86400000) this.receipts.set(receipt.id, receipt) } catch { /* incomplete last record stays uncertain */ }
      }
    }).catch((error) => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error })
  }
  private async persist(receipt: Receipt) {
    this.receipts.set(receipt.id, receipt)
    const next = this.logTail.then(async () => { await mkdir(dirname(this.ledgerPath), { recursive: true }); await appendFile(this.ledgerPath, JSON.stringify(receipt) + '\n', { encoding: 'utf8', mode: 0o600, flush: true }) })
    this.logTail = next.catch(() => undefined)
    await next
  }
  async receipt(id: string, client: ControlClient) {
    await this.loadReceipts()
    const receipt = this.receipts.get(id)
    return receipt?.scope === client.scope ? receipt : null
  }
  /** Journal acceptance before touching the executor; ambiguous delivery is never resent. */
  async sendOnce(threadId: string, client: ControlClient, proof: ControlProof | null, id: string, params: unknown, action: () => Promise<unknown>) {
    return this.serial(threadId, () => { this.verify(threadId, client, proof).heartbeat = this.now(); return this.journalSend(threadId, client, proof, id, params, action) })
  }
  /** Called by the queue processor only while mutate() holds the same thread serial lock. */
  async journalSend(threadId: string, client: ControlClient, proof: ControlProof | null, id: string, params: unknown, action: () => Promise<unknown>) {
      if (!/^[a-zA-Z0-9-]{16,100}$/.test(id)) throw new ControlError('control_invalid', '发送请求缺少唯一编号。')
      this.verify(threadId, client, proof)
      await this.loadReceipts()
      const hash = createHash('sha256').update(JSON.stringify(params)).digest('hex')
      const old = this.receipts.get(id)
      if (old) {
        if (old.scope !== client.scope || old.threadId !== threadId || old.hash !== hash) reject('发送编号与原消息不匹配。')
        if (old.state === 'completed') return old.result
        throw new ControlError('delivery_uncertain', '此消息已有发送记录。请先核对最新历史，确认是否已执行；不会自动重复发送。')
      }
      if (this.receipts.size >= 10000) throw new ControlError('control_capacity', '发送记录已满，请先备份并维护 webui-send-receipts.jsonl。')
      const receipt: Receipt = { id, scope: client.scope, threadId, hash, state: 'pending', at: this.now() }
      await this.persist(receipt)
      let result: unknown
      try { result = await action() } catch (error) {
        // A transport timeout may have created a turn. Keep pending rather than declare rejection.
        if (/already has an active writer|thread not found|invalid (?:params|argument)|unsupported/iu.test(String(error))) await this.persist({ ...receipt, state: 'rejected' })
        throw error
      }
      const turn = (result as { turn?: { id?: string; status?: string } })?.turn
      await this.persist({ ...receipt, state: 'completed', result: { turn: turn ? { id: turn.id, status: turn.status } : null } })
      return result
  }
}
