import { describe, expect, it, vi } from 'vitest'
import { ThreadWriterLifecycle, watchThreadClosed } from './threadWriterLifecycle'

const closedImmediately = () => ({ closed: Promise.resolve(true), dispose: vi.fn() })

describe('thread writer lifecycle', () => {
  it.each(['idle', 'systemError'])('flushes and releases our inactive %s writer, without reading history', async (type) => {
    const rpc = vi.fn().mockResolvedValueOnce({ thread: { status: { type } } })
      .mockResolvedValueOnce({ status: 'unsubscribed' })
    await expect(new ThreadWriterLifecycle().releaseIdle('original', rpc, closedImmediately)).resolves.toBe(true)
    expect(rpc.mock.calls).toEqual([
      ['thread/read', { threadId: 'original', includeTurns: false }],
      ['thread/unsubscribe', { threadId: 'original' }],
    ])
  })

  it.each(['active', 'notLoaded', undefined])('never unsubscribes a %s thread', async (type) => {
    const rpc = vi.fn().mockResolvedValue({ thread: { status: { type } } })
    const watchClose = vi.fn(closedImmediately)
    await expect(new ThreadWriterLifecycle().releaseIdle('original', rpc, watchClose)).resolves.toBe(false)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(watchClose).not.toHaveBeenCalled()
  })

  it('serializes release with sends and leaves different threads independent', async () => {
    const lifecycle = new ThreadWriterLifecycle()
    let finishRead!: (value: unknown) => void
    const events: string[] = []
    const rpc = vi.fn(async (method: string) => {
      events.push(method)
      if (method === 'thread/read') return new Promise(resolve => { finishRead = resolve })
      return { status: 'unsubscribed' }
    })
    const release = lifecycle.releaseIdle('first', rpc, closedImmediately)
    const send = lifecycle.run('first', async () => { events.push('send'); return true })
    await expect(lifecycle.run('other', async () => 'independent')).resolves.toBe('independent')
    expect(events).toEqual(['thread/read'])
    finishRead({ thread: { status: { type: 'idle' } } })
    await release
    await send
    expect(events).toEqual(['thread/read', 'thread/unsubscribe', 'send'])
  })

  it('does not pin a thread after failed cleanup', async () => {
    const lifecycle = new ThreadWriterLifecycle()
    await expect(lifecycle.run('first', async () => { throw new Error('offline') })).rejects.toThrow('offline')
    await expect(lifecycle.run('first', async () => 'recovered')).resolves.toBe('recovered')
  })

  it('blocks the next send until the native writer really closes', async () => {
    const lifecycle = new ThreadWriterLifecycle()
    let close!: (value: boolean) => void
    const dispose = vi.fn()
    const rpc = vi.fn().mockResolvedValueOnce({ thread: { status: { type: 'idle' } } })
      .mockResolvedValueOnce({ status: 'unsubscribed' })
    const release = lifecycle.releaseIdle('first', rpc, () => ({
      closed: new Promise(resolve => { close = resolve }), dispose,
    }))
    const send = vi.fn(async () => true)
    const next = lifecycle.run('first', send)
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(2))
    expect(send).not.toHaveBeenCalled()
    close(true)
    await expect(release).resolves.toBe(true)
    await expect(next).resolves.toBe(true)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('cleans up the close subscription if unsubscribe fails', async () => {
    const waiter = closedImmediately()
    const rpc = vi.fn().mockResolvedValueOnce({ thread: { status: { type: 'idle' } } })
      .mockRejectedValueOnce(new Error('offline'))
    await expect(new ThreadWriterLifecycle().releaseIdle('first', rpc, () => waiter)).rejects.toThrow('offline')
    expect(waiter.dispose).toHaveBeenCalledTimes(1)
  })

  it('waits for the correct close notification and removes its timer/listener', async () => {
    vi.useFakeTimers()
    try {
      let listener!: (value: { method: string; params: unknown }) => void
      const unsubscribe = vi.fn()
      const waiter = watchThreadClosed('first', callback => { listener = callback; return unsubscribe })
      listener({ method: 'thread/closed', params: { threadId: 'other' } })
      listener({ method: 'thread/status/changed', params: { threadId: 'first' } })
      listener({ method: 'thread/closed', params: { threadId: 'first' } })
      await expect(waiter.closed).resolves.toBe(true)
      waiter.dispose()
      expect(unsubscribe).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })

  it('never reports a successful release if native teardown times out', async () => {
    vi.useFakeTimers()
    try {
      const unsubscribe = vi.fn()
      const waiter = watchThreadClosed('first', () => unsubscribe, 100)
      await vi.advanceTimersByTimeAsync(100)
      await expect(waiter.closed).resolves.toBe(false)
      waiter.dispose()
      expect(unsubscribe).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
})
