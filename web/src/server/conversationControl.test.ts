import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConversationControl, ControlError, controlCookieScope } from './conversationControl'
let dir: string
let now: number
let control: ConversationControl
it('binds control to the web login regardless of Cloudflare cookie order or renewal', () => {
  const first = controlCookieScope('CF_Authorization=old; portal_session=web-login')
  expect(controlCookieScope('portal_session=web-login; CF_Authorization=new')).toBe(first)
  expect(controlCookieScope('CF_Authorization=new; portal_session=web-login')).toBe(first)
  expect(controlCookieScope('portal_session=other-login')).not.toBe(first)
})
it('keeps an active owner registered while reclaiming idle browser registrations', async () => {
  const active = control.register('scope', 'active')
  const state = control.status('active-thread', active)
  const owned = await control.claim('active-thread', active, state.epoch, state.version, false)
  control.activity('active-thread', 'running', 'running-turn')
  for (let i = 1; i < 512; i++) control.register('scope', 'unused')
  now += 2 * 86400000
  expect(control.register('scope', 'fresh')).toBeDefined()
  expect(control.authenticate(active.id, active.key, active.scope)).toBe(active)
  expect(control.status('active-thread', active).activity).toBe('running')
  await expect(control.mutate('active-thread', active, owned.proof, async () => true)).rejects.toThrow()
})
it('reclaims expired terminals without deleting active owners or allowing an old proof', async () => {
  const original = control.register('scope', 'first')
  const state = control.status('thread-old', original)
  const claimed = await control.claim('thread-old', original, state.epoch, state.version, false)
  for (let i = 1; i < 512; i++) control.register('scope', 'idle')
  now += 2 * 86400000
  const current = control.register('scope', 'new')
  expect(current.id).not.toBe(original.id)
  expect(() => control.authenticate(original.id, original.key, original.scope)).toThrow()
  await expect(control.mutate('thread-old', current, claimed.proof, async () => true)).rejects.toThrow()
})
it('retains unresolved sends beyond retention and compacts completed journal rows', async () => {
  const receipt = { id: 'pending-retain-0001', scope: 'scope', threadId: 'thread', hash: 'hash', state: 'pending', at: now - 90 * 86400000 }
  const ledger = join(dir, 'receipts.jsonl')
  await writeFile(ledger, Array.from({ length: 1100 }, () => JSON.stringify(receipt)).join('\n') + '\n')
  const current = control.register('scope', 'current')
  expect(await control.receipt(receipt.id, current)).toMatchObject({ state: 'pending' })
  const status = control.status('new-thread', current)
  const state = await control.claim('new-thread', current, status.epoch, status.version, false)
  await control.sendOnce('new-thread', current, state.proof, 'completed-send-001', {}, async () => ({ turn: { id: 'turn' } }))
  expect((await readFile(ledger, 'utf8')).trim().split('\n').length).toBeLessThan(10)
  const restarted = new ConversationControl(ledger, () => now)
  const terminal = restarted.register('scope', 'reload')
  expect(await restarted.receipt(receipt.id, terminal)).toMatchObject({ state: 'pending' })
  expect(await restarted.receipt('completed-send-001', terminal)).toMatchObject({ state: 'completed' })
})
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'control-test-')); now = Date.now(); control = new ConversationControl(join(dir, 'receipts.jsonl'), () => now) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })
function clients() { return [control.register('same-auth', '网页 A'), control.register('same-auth', '网页 B')] as const }
describe('browser control and executor handoff', () => {
  it('viewing never claims; explicit takeover fences all stale mutations and heartbeats', async () => {
    const [a, b] = clients(); const initial = control.status('t', a)
    expect(initial.owner).toBeNull()
    const owned = await control.claim('t', a, initial.epoch, initial.version, false)
    const seen = control.status('t', b)
    expect(seen.proof).toBeNull()
    await control.claim('t', b, seen.epoch, seen.version, true)
    const action = vi.fn()
    await expect(control.mutate('t', a, owned.proof, action)).rejects.toMatchObject({ code: 'control_conflict' })
    expect(() => control.heartbeat('t', a, owned.proof)).toThrow()
    expect(action).not.toHaveBeenCalled()
  })
  it('two concurrent takeovers from the same view cannot both succeed', async () => {
    const [a, b] = clients(); const s = control.status('t', a)
    const results = await Promise.allSettled([control.claim('t', a, s.epoch, s.version, true), control.claim('t', b, s.epoch, s.version, true)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  })
  it('active tasks and approvals survive takeover, release, and heartbeat expiry', async () => {
    const [a, b] = clients(); const s = control.status('t', a)
    const owned = await control.claim('t', a, s.epoch, s.version, false)
    control.activity('t', 'running', 'turn')
    control.activity('t', 'approval')
    const release = vi.fn()
    await control.release('t', a, owned.proof, release)
    expect(release).not.toHaveBeenCalled()
    const state = control.status('t', b)
    const next = await control.claim('t', b, state.epoch, state.version, true)
    now += 31000
    expect(control.status('t', b)).toMatchObject({ owner: null, activity: 'approval', turnId: 'turn' })
    expect(() => control.heartbeat('t', b, next.proof)).toThrow()
  })
  it('idle release invokes only the supplied idle-writer release', async () => {
    const [a] = clients(); const s = control.status('t', a)
    const owned = await control.claim('t', a, s.epoch, s.version, false)
    control.activity('t', 'idle')
    const release = vi.fn().mockResolvedValue({ released: true })
    await control.release('t', a, owned.proof, release)
    expect(release).toHaveBeenCalledTimes(1)
  })
  it('stop-and-takeover waits for completion and rejects old proof after handoff', async () => {
    const [a, b] = clients(); const s = control.status('t', a)
    const owned = await control.claim('t', a, s.epoch, s.version, false)
    control.activity('t', 'running', 'turn')
    let finish!: () => void
    const stopping = control.claim('t', b, s.epoch, owned.version, true, () => new Promise<void>((resolve) => { finish = resolve }))
    await Promise.resolve(); await Promise.resolve()
    expect(control.status('t', b).transferring).toBe(true)
    finish(); await stopping
    await expect(control.mutate('t', a, owned.proof, async () => 'stop')).rejects.toThrow()
  })
  it('failed stop never grants the requester control or labels task idle', async () => {
    const [a, b] = clients(); const s = control.status('t', a)
    const owned = await control.claim('t', a, s.epoch, s.version, false)
    await expect(control.claim('t', b, s.epoch, owned.version, true, async () => { throw new Error('timeout') })).rejects.toThrow('timeout')
    expect(control.status('t', b)).toMatchObject({ owner: { id: a.id }, activity: 'unknown' })
  })
  it('background queue attempts do not extend a lost browser lease', async () => {
    const [a] = clients(); const s = control.status('t', a); const owned = await control.claim('t', a, s.epoch, 0, false)
    now += 29000; await control.mutate('t', a, owned.proof, async () => undefined, false)
    now += 1001; expect(control.status('t', a).owner).toBeNull()
  })
  it('deduplicates accepted messages and stores no message text or client secret', async () => {
    const [a] = clients(); const s = control.status('t', a); const owned = await control.claim('t', a, s.epoch, 0, false)
    const action = vi.fn().mockResolvedValue({ turn: { id: 'turn', status: 'inProgress' }, secret: 'omit' })
    const params = { input: 'private-prompt' }; const id = 'request-1234567890123456'
    await control.sendOnce('t', a, owned.proof, id, params, action)
    expect(await control.sendOnce('t', a, owned.proof, id, params, action)).toEqual({ turn: { id: 'turn', status: 'inProgress' } })
    expect(action).toHaveBeenCalledTimes(1)
    const text = await readFile(join(dir, 'receipts.jsonl'), 'utf8')
    expect(text).not.toContain('private-prompt'); expect(text).not.toContain(a.key); expect(text).not.toContain('omit')
  })
  it('restart invalidates controls but preserves ambiguous send receipts for the same authenticated session', async () => {
    const [a] = clients(); const s = control.status('t', a); const owned = await control.claim('t', a, s.epoch, 0, false)
    const id = 'request-1234567890123456'; const params = { input: 'test' }
    await expect(control.sendOnce('t', a, owned.proof, id, params, async () => { throw new Error('transport closed') })).rejects.toThrow()
    const restarted = new ConversationControl(join(dir, 'receipts.jsonl'))
    expect(() => restarted.authenticate(a.id, a.key, a.scope)).toThrow()
    const b = restarted.register(a.scope, 'new')
    const fresh = await restarted.claim('t', b, restarted.epoch, 0, false)
    const send = vi.fn()
    await expect(restarted.sendOnce('t', b, fresh.proof, id, params, send)).rejects.toMatchObject({ code: 'delivery_uncertain' })
    expect(send).not.toHaveBeenCalled()
    expect(await restarted.receipt(id, restarted.register('other-auth', 'other'))).toBeNull()
  })
  it('does not regress a completed notification to running after a delayed start response', () => {
    control.activity('t', 'idle', 'finished-turn')
    control.activity('t', 'running', 'finished-turn')
    expect(control.status('t', clients()[0]).activity).toBe('idle')
  })
  it.each(['request_not_sent', 'desktop_thread_busy', 'desktop_bridge_unavailable', 'delivery_uncertain'])('records %s according to whether the request reached the executor', async code => {
    const [a] = clients(); const s = control.status('t', a); const owned = await control.claim('t', a, s.epoch, 0, false)
    const id = 'request-1234567890123456'
    await expect(control.sendOnce('t', a, owned.proof, id, {}, async () => { throw new ControlError(code, 'test') })).rejects.toMatchObject({ code })
    expect((await control.receipt(id, a))?.state).toBe(code === 'delivery_uncertain' ? 'pending' : 'rejected')
  })
  it('binds terminal credentials to the authentication session', () => {
    const [a] = clients()
    expect(() => control.authenticate(a.id, a.key, 'different-auth')).toThrow()
    expect(() => control.authenticate(a.id, 'wrong-key', a.scope)).toThrow()
  })
})
