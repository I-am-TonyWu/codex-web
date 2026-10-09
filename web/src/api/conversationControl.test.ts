import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyControlState, conversationStates, type ControlState } from './conversationControl'
afterEach(() => { for (const key of Object.keys(conversationStates)) delete conversationStates[key]; vi.unstubAllGlobals() })
const state = (revision: number, activity: string, version = 1): ControlState => ({ threadId: 't', epoch: 'process', version, revision, activity, owner: { id: 'a', label: '网页' }, proof: { epoch: 'process', version, token: 'proof' }, turnId: null, transferring: false, desktopReleaseAvailable: false })
describe('current control snapshots', () => {
  it('does not let a late poll reintroduce a writer conflict after successful recheck', () => {
    applyControlState(state(1, 'external'))
    applyControlState(state(2, 'idle'))
    applyControlState(state(1, 'external'))
    expect(conversationStates.t.activity).toBe('idle')
  })
  it('does not restore stale proof after takeover even if its activity revision is higher', () => {
    applyControlState(state(3, 'running', 2))
    applyControlState(state(10, 'external', 1))
    expect(conversationStates.t.version).toBe(2)
  })
})
