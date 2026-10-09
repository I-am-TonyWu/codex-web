import { afterEach, describe, expect, it, vi } from 'vitest'
import { rpcCall } from './codexRpcClient'

const applyControlState = vi.hoisted(() => vi.fn())
vi.mock('./conversationControl', () => ({ rpcControlHeaders: async () => ({}), sendRequestId: async () => 'fixture-id', clearPendingSend: () => {}, refreshControl: async () => ({}), applyControlState }))

afterEach(() => vi.unstubAllGlobals())

describe('RPC errors through an HTTP gateway', () => {
  it('updates native writer status immediately on both rejection and successful resume', async () => {
    const control = { threadId: 'original', epoch: 'process', version: 1, revision: 1, activity: 'external' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ result: { webReadOnlyReason: 'thread_writer_conflict' }, control })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: {}, control: { ...control, revision: 2, activity: 'idle' } }))))
    await rpcCall('thread/resume', { threadId: 'original' })
    await rpcCall('thread/resume', { threadId: 'original' })
    expect(applyControlState).toHaveBeenLastCalledWith(expect.objectContaining({ activity: 'idle', revision: 2 }))
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('preserves an application rejection carried in an HTTP 200 error envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'rpc_error', message: 'invalid thread id' } }))))
    await expect(rpcCall('turn/start', {})).rejects.toMatchObject({ code: 'rpc_error', message: 'invalid thread id', status: 200 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('explains writer conflicts without retrying a rejected write', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'thread_writer_conflict', message: 'thread original already has an active writer' } }))))
    await expect(rpcCall('turn/start', {})).rejects.toMatchObject({ code: 'thread_writer_conflict', message: expect.stringContaining('在网页接续') })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('hides proxy HTML and asks users to check delivery before retrying', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!DOCTYPE html><html><title>502 Bad gateway</title></html>', { status: 502 })))
    await expect(rpcCall('turn/start', {})).rejects.toMatchObject({ code: 'http_error', status: 502, message: expect.stringContaining('确认是否已发送') })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps successful RPCs compatible with existing clients', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: { turn: { id: 'accepted' } } }))))
    await expect(rpcCall('turn/start', {})).resolves.toEqual({ turn: { id: 'accepted' } })
  })
})
