import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const pendingKey = 'codex-web.pending-sends.v1'
let storage: Map<string, string>
beforeEach(() => {
  vi.resetModules(); storage = new Map()
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
  vi.stubGlobal('navigator', { userAgent: 'test' })
})
afterEach(() => vi.unstubAllGlobals())
function pending() { storage.set(pendingKey, JSON.stringify({ t: { id: 'old-request-1234567890', fingerprint: 'old' } })) }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
it('checks a completed receipt before blocking the next click, without resending it', async () => {
  pending()
  const fetch = vi.fn(async (url: string) => json({ data: url.endsWith('/register') ? { id: 'a', key: 'key' } : { state: 'completed' } }))
  vi.stubGlobal('fetch', fetch)
  const api = await import('./conversationControl')
  await expect(api.sendRequestId('t', {})).rejects.toThrow('已确认发送')
  expect(JSON.parse(storage.get(pendingKey)!)).toEqual({})
  expect(fetch.mock.calls.some(([url]) => url === '/codex-api/rpc')).toBe(false)
})
it('allows an explicit retry only after the server has confirmed rejection', async () => {
  pending()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => json({ data: url.endsWith('/register') ? { id: 'a', key: 'key' } : { state: 'rejected' } })))
  const api = await import('./conversationControl')
  expect(await api.sendRequestId('t', {})).not.toBe('old-request-1234567890')
})
it.each(['pending', null])('preserves an ambiguous receipt %s and never retries the message', async state => {
  pending()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => json({ data: url.endsWith('/register') ? { id: 'a', key: 'key' } : state ? { state } : null })))
  const api = await import('./conversationControl')
  await expect(api.sendRequestId('t', {})).rejects.toMatchObject({ code: 'delivery_uncertain' })
  expect(JSON.parse(storage.get(pendingKey)!).t.id).toBe('old-request-1234567890')
})
it('re-registers a stale browser identity for control reads after a service restart', async () => {
  let restarted = false, registrations = 0
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/register')) return json({ data: { id: `client-${++registrations}`, key: 'key' } })
    const id = (init.headers as Record<string, string>)['x-codex-client']
    if (restarted && id === 'client-1') return json({ error: { code: 'control_client_expired', message: 'expired' } }, 409)
    return json({ data: { threadId: 't', epoch: restarted ? 'new' : 'old', version: 0, owner: null, proof: null } })
  })
  vi.stubGlobal('fetch', fetch)
  const api = await import('./conversationControl')
  await api.refreshControl('t'); restarted = true
  expect((await api.refreshControl('t')).epoch).toBe('new')
  expect(registrations).toBe(2)
})
it('does not clear a newer pending request when an older response arrives late', async () => {
  pending()
  const api = await import('./conversationControl')
  api.clearPendingSend('t', 'different-request')
  expect(JSON.parse(storage.get(pendingKey)!).t).toBeDefined()
})
it('refreshes the epoch and lease version before an explicit takeover', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/register')) return json({ data: { id: 'a', key: 'key' } })
    if (url.endsWith('/claim')) {
      expect(JSON.parse(String(init.body))).toMatchObject({ epoch: 'current', version: 7, takeover: true })
      return json({ data: { threadId: 't', epoch: 'current', version: 8, proof: { epoch: 'current', version: 8, token: 'new' } } })
    }
    return json({ data: { threadId: 't', epoch: 'current', version: 7, owner: null, proof: null } })
  }))
  const api = await import('./conversationControl')
  api.applyControlState({ threadId: 't', epoch: 'stale', version: 1 } as any)
  expect((await api.claimControl('t', true)).version).toBe(8)
})
it('preserves pending protection when session storage is unavailable', async () => {
  vi.stubGlobal('sessionStorage', { getItem: () => { throw Error('disabled') }, setItem: () => { throw Error('disabled') } })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => json({ data: url.endsWith('/register') ? { id: 'a', key: 'key' } : { state: 'pending' } })))
  const api = await import('./conversationControl')
  const id = await api.sendRequestId('t', {})
  await expect(api.sendRequestId('t', {})).rejects.toMatchObject({ code: 'delivery_uncertain' })
  expect(api.pendingSendByThreadId.t.id).toBe(id)
})
