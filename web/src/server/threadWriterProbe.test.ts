import { describe, expect, it, vi } from 'vitest'
import { recheckThreadWriter } from './threadWriterProbe'

describe('explicit writer recheck', () => {
  it('keeps an external writer intact and confirms availability after normal release', async () => {
    const rpc = vi.fn().mockRejectedValueOnce(new Error('thread t already has an active writer'))
      .mockResolvedValueOnce({ thread: { id: 't', status: { type: 'idle' } } })
      .mockResolvedValueOnce({ released: true })
    expect(await recheckThreadWriter('t', rpc)).toEqual({ activity: 'external', turnId: null })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(await recheckThreadWriter('t', rpc)).toEqual({ activity: 'idle', turnId: null })
    expect(rpc.mock.calls.map(c => c[0])).toEqual(['thread/resume', 'thread/resume', 'codexui/thread/release'])
  })
  it('never releases a running turn or hides an unknown failure', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ thread: { status: { type: 'active' }, turns: [{ id: 'turn', status: 'inProgress' }] } })
      .mockRejectedValueOnce(new Error('native connection lost'))
    expect(await recheckThreadWriter('t', rpc)).toEqual({ activity: 'running', turnId: 'turn' })
    expect(rpc).toHaveBeenCalledTimes(1)
    await expect(recheckThreadWriter('t', rpc)).rejects.toThrow('native connection lost')
  })
})
