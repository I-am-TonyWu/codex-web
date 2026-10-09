import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopThreadBridge, DesktopIpcClient, applyDesktopPatches, desktopTurns } from './desktopThreadBridge.js'

const threadId = 'test-thread'
const state = () => ({ id: threadId, cwd: 'C:\\test', title: 'Original', threadRuntimeStatus: { type: 'idle' }, turns: [{ turnId: 'old', status: 'completed', items: [{ id: 'old-message', type: 'agentMessage', text: 'history' }] }], requests: [] as any[] })
class FakeIpc {
  onBroadcast = (_: any) => {}; onDisconnect = () => {}
  state: any = state()
  connect = vi.fn(async () => {})
  request = vi.fn(async (method: string, params: any, owner?: string) => {
    if (method === 'thread-owner-discovery') return { handledByClientId: 'desktop-owner', result: { supportsUntrustedAppInput: true } }
    if (method === 'thread-follower-read-model-settings') return { result: { settings: { resumeState: 'resumed' } } }
    return { result: { result: { turn: { id: 'new', status: 'inProgress' } }, ok: true } }
  })
  follow = vi.fn((id: string, owner: string, following: boolean) => { if (following) this.snapshot(this.state) })
  close = vi.fn()
  snapshot(value: any, revision = 1, version = 11) {
    this.onBroadcast({ type: 'broadcast', method: 'thread-stream-state-changed', sourceClientId: 'desktop-owner', version,
      params: { hostId: 'local', conversationId: threadId, change: { type: 'snapshot', revision, conversationState: value } } })
  }
  patches(patches: any[], baseRevision = 1, revision = 2) {
    this.onBroadcast({ type: 'broadcast', method: 'thread-stream-state-changed', sourceClientId: 'desktop-owner', version: 11,
      params: { hostId: 'local', conversationId: threadId, change: { type: 'patches', baseRevision, revision, patches } } })
  }
}
const open: DesktopThreadBridge[] = []
function setup() {
  const ipc = new FakeIpc(), emit = vi.fn(), bridge = new DesktopThreadBridge(emit, ipc as unknown as DesktopIpcClient, true)
  open.push(bridge)
  return { bridge, ipc, emit }
}
afterEach(() => { for (const b of open.splice(0)) b.close(); vi.useRealTimers() })

describe('desktop coordination preserves the original writer', () => {
  it('discovers and reads the actual owner without sending a turn', async () => {
    const { bridge, ipc } = setup()
    expect(await bridge.attach(threadId)).toBe(true)
    expect(bridge.snapshot(threadId)?.thread.id).toBe(threadId)
    expect(ipc.request.mock.calls.map(c => c[0])).toEqual(['thread-owner-discovery', 'thread-follower-read-model-settings'])
    await bridge.rpc(threadId, 'thread/resume', {})
    expect(ipc.request).toHaveBeenCalledTimes(2)
  })
  it('manual send goes once to the identified owner with workspace sandbox and on-request approval', async () => {
    const { bridge, ipc } = setup(); await bridge.attach(threadId)
    const result: any = await bridge.rpc(threadId, 'turn/start', { threadId, input: [{ type: 'text', text: 'manual' }], model: 'test-model', effort: 'high', attachments: [{ path: 'C:\\test\\a.txt' }] })
    expect(result.turn.id).toBe('new')
    const call = ipc.request.mock.calls.at(-1)!
    expect(call[0]).toBe('thread-follower-start-turn'); expect(call[2]).toBe('desktop-owner')
    expect(call[1].turnStart.request).toMatchObject({ threadId, model: 'test-model', effort: 'high', approvalPolicy: 'on-request', permissions: null, sandboxPolicy: { type: 'workspaceWrite', writableRoots: ['C:\\test'], networkAccess: false } })
    expect(call[1].turnStart.context).toMatchObject({ inheritThreadSettings: false, useAppServerPermissionDefault: false, attachments: [{ path: 'C:\\test\\a.txt' }] })
    expect(ipc.request.mock.calls.filter(c => c[0] === 'thread-follower-start-turn')).toHaveLength(1)
  })
  it.each(['task', 'approval', 'unconfirmed', 'queued', 'goal'])('blocks a second send while %s is pending', async kind => {
    const { bridge, ipc } = setup()
    if (kind === 'task') ipc.state.threadRuntimeStatus = { type: 'active' }
    if (kind === 'approval') ipc.state.requests = [{ id: 2, method: 'item/commandExecution/requestApproval', params: {} }]
    if (kind === 'unconfirmed') ipc.state.unconfirmedTurnSubmissions = [{ requestId: 'uncertain' }]
    if (kind === 'queued') ipc.state.queuedMessages = [{ id: 'queue' }]
    if (kind === 'goal') ipc.state.threadGoal = { status: 'active' }
    await bridge.attach(threadId)
    await expect(bridge.rpc(threadId, 'turn/start', { input: [] })).rejects.toMatchObject({ code: 'desktop_thread_busy' })
    expect(ipc.request.mock.calls.some(c => c[0] === 'thread-follower-start-turn')).toBe(false)
  })
  it('retains uncertain delivery and never retries automatically', async () => {
    const { bridge, ipc } = setup(); await bridge.attach(threadId)
    ipc.request.mockRejectedValueOnce(new Error('request-timeout'))
    await expect(bridge.rpc(threadId, 'turn/start', { input: [] })).rejects.toThrow('request-timeout')
    expect(ipc.request).toHaveBeenCalledTimes(3)
    await expect(bridge.rpc(threadId, 'turn/start', { input: [] })).rejects.toMatchObject({ code: 'desktop_thread_busy' })
    expect(ipc.request).toHaveBeenCalledTimes(3)
  })
  it('blocks another manual send until an accepted turn arrives in the stream', async () => {
    const { bridge, ipc } = setup(); await bridge.attach(threadId)
    await bridge.rpc(threadId, 'turn/start', { input: [] })
    await expect(bridge.rpc(threadId, 'turn/start', { input: [] })).rejects.toMatchObject({ code: 'desktop_thread_busy' })
    expect(bridge.snapshot(threadId)?.thread.status.type).toBe('active')
    ipc.patches([{ op: 'add', path: ['turns', 1], value: { turnId: 'new', status: 'completed', items: [] } }])
    expect(bridge.snapshot(threadId)?.thread.status.type).toBe('idle')
    await bridge.rpc(threadId, 'turn/start', { input: [] })
    expect(ipc.request.mock.calls.filter(c => c[0] === 'thread-follower-start-turn')).toHaveLength(2)
  })
  it('rejects a malformed acceptance instead of announcing success', async () => {
    const { bridge, ipc } = setup(); await bridge.attach(threadId)
    ipc.request.mockResolvedValueOnce({ result: { result: {} } } as any)
    await expect(bridge.rpc(threadId, 'turn/start', { input: [] })).rejects.toMatchObject({ code: 'delivery_uncertain' })
  })
  it('forwards explicit stop with the expected turn ID', async () => {
    const { bridge, ipc } = setup(); await bridge.attach(threadId)
    await bridge.rpc(threadId, 'turn/interrupt', { turnId: 'running' })
    expect(ipc.request).toHaveBeenLastCalledWith('thread-follower-interrupt-turn', { conversationId: threadId, mode: 'user-stop', expectedTurnId: 'running' }, 'desktop-owner')
  })
  it('streams new turns, messages and completion without replaying old history', async () => {
    vi.useFakeTimers()
    const { bridge, ipc, emit } = setup(); await bridge.attach(threadId)
    await vi.advanceTimersByTimeAsync(110); emit.mockClear()
    ipc.patches([{ op: 'add', path: ['turns', 1], value: { turnId: 'new', status: 'inProgress', items: [{ id: 'message', type: 'agentMessage', text: 'partial' }] } }])
    await vi.advanceTimersByTimeAsync(110)
    expect(emit.mock.calls.map(c => c[0].method)).toContain('turn/started')
    expect(emit.mock.calls.find(c => c[0].method === 'item/completed')?.[0].params.item.text).toBe('partial')
    ipc.patches([{ op: 'replace', path: ['turns', 1, 'items', 0, 'text'], value: 'finished' }, { op: 'replace', path: ['turns', 1, 'status'], value: 'completed' }], 2, 3)
    await vi.advanceTimersByTimeAsync(110)
    expect(emit.mock.calls.filter(c => c[0].method === 'turn/completed')).toHaveLength(1)
    expect(emit.mock.calls.some(c => c[0].params?.item?.id === 'old-message')).toBe(false)
  })
  it('routes an approval to its native ID and resolves only after native state changes', async () => {
    const { bridge, ipc, emit } = setup(); await bridge.attach(threadId)
    ipc.patches([{ op: 'add', path: ['requests', 0], value: { id: 'native-request', method: 'item/commandExecution/requestApproval', params: { turnId: 'new', command: 'dir' } } }])
    const approval = bridge.listPending()[0]!
    expect(approval.id).toBeLessThan(0)
    await bridge.respond(approval.id, { decision: 'accept' })
    expect(ipc.request).toHaveBeenLastCalledWith('thread-follower-command-approval-decision', { conversationId: threadId, requestId: 'native-request', decision: 'accept' }, 'desktop-owner')
    expect(bridge.listPending()).toHaveLength(1)
    ipc.patches([{ op: 'remove', path: ['requests', 0] }], 2, 3)
    expect(bridge.listPending()).toHaveLength(0)
    expect(emit.mock.calls.some(c => c[0].method === 'server/request/resolved')).toBe(true)
  })
  it('preserves older disk history when merging live desktop turns', async () => {
    const { bridge } = setup(); await bridge.attach(threadId)
    const merged: any = bridge.mergeRead(threadId, { thread: { id: threadId, turns: [{ id: 'older', items: [] }, { id: 'old', items: [] }] }, hasMore: true })
    expect(merged.thread.turns.map((t: any) => t.id)).toEqual(['older', 'old'])
    expect(merged.thread.turns[1].items[0].text).toBe('history'); expect(merged.hasMore).toBe(true)
  })
  it('refuses missing stream revisions and future versions', async () => {
    const { bridge, ipc } = setup(); await bridge.attach(threadId)
    ipc.patches([], 99, 100)
    expect(bridge.connected(threadId)).toBe(false)
    await expect(bridge.rpc(threadId, 'turn/start', { input: [] })).rejects.toMatchObject({ code: 'desktop_bridge_unavailable' })
    ipc.snapshot(state(), 101, 12)
    expect(bridge.connected(threadId)).toBe(false)
  })
  it('drops unavailable owner state and permits an explicit recheck to reconnect', async () => {
    const { bridge, ipc } = setup(); await bridge.attach(threadId)
    ipc.onDisconnect()
    await expect(bridge.rpc(threadId, 'turn/start', { input: [] })).rejects.toMatchObject({ code: 'desktop_bridge_unavailable' })
    expect(await bridge.rpc(threadId, 'thread/resume', {})).toMatchObject({ webExecutionSource: 'desktop' })
  })
  it('detaches without archive, stop, unsubscribe or sending the draft', async () => {
    const { bridge, ipc } = setup(); await bridge.attach(threadId); bridge.detach(threadId)
    expect(ipc.follow).toHaveBeenLastCalledWith(threadId, 'desktop-owner', false)
    expect(ipc.request).toHaveBeenCalledTimes(2)
    expect(bridge.has(threadId)).toBe(false)
  })
  it('removes native approvals when an idle subscription is explicitly detached', async () => {
    const { bridge, ipc, emit } = setup(); await bridge.attach(threadId)
    ipc.patches([{ op: 'add', path: ['requests', 0], value: { id: 'native-request', method: 'item/tool/requestUserInput', params: {} } }])
    const approval = bridge.listPending()[0]!
    bridge.detach(threadId)
    expect(bridge.listPending()).toHaveLength(0)
    await expect(bridge.respond(approval.id, {})).rejects.toThrow('no-longer-available')
    expect(emit.mock.calls.some(c => c[0].method === 'server/request/resolved')).toBe(true)
  })
})

describe('native state conversion and patch boundaries', () => {
  it('uses canonical island order rather than entity dictionary order', () => {
    const s = { turnHistory: { kind: 'canonical', history: { entitiesByKey: { a: { turnId: 'a', items: [] }, b: { turnId: 'b', items: [] } }, islands: [{ entries: [{ value: 'b' }, { value: 'a' }] }] } } }
    expect(desktopTurns(s).map(t => t.id)).toEqual(['b', 'a'])
  })
  it('applies array insertion/removal without modifying the source', () => {
    const source = { values: [1, 2] }
    expect(applyDesktopPatches(source, [{ op: 'add', path: ['values', 1], value: 3 }, { op: 'remove', path: ['values', 0] }])).toEqual({ values: [3, 2] })
    expect(source.values).toEqual([1, 2])
  })
  it.each(['__proto__', 'constructor', 'prototype'])('rejects prototype path %s', key => {
    expect(() => applyDesktopPatches({}, [{ op: 'replace', path: [key, 'polluted'], value: true }])).toThrow()
    expect(({} as any).polluted).toBeUndefined()
  })
})
