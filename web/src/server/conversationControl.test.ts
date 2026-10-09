import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConversationControl, ControlError } from './conversationControl'
let dir: string
let now: number
let control: ConversationControl
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
  it.each(['desktop_thread_busy', 'desktop_bridge_unavailable', 'delivery_uncertain'])('records %s according to whether the request reached the executor', async code => {
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
