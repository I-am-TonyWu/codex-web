import { describe, expect, it } from 'vitest'
import { readServiceJson } from './serviceJson'

describe('settings API gateway errors', () => {
  it('accepts JSON account and provider responses', async () => {
    expect(await readServiceJson(Response.json({ data: { accounts: [] } }), 'failed')).toEqual({ data: { accounts: [] } })
    expect(await readServiceJson(Response.json({ enabled: false }), 'failed')).toEqual({ enabled: false })
  })
  it.each([502, 503, 504])('reports HTML HTTP %s without exposing markup or parser errors', async status => {
    await expect(readServiceJson(new Response('<!DOCTYPE html><title>Bad gateway</title>', { status }), 'failed')).rejects.toThrow(`HTTP ${status}`)
  })
  it('rejects operational errors wrapped in HTTP 200 JSON', async () => {
    await expect(readServiceJson(Response.json({ ok: false, error: 'account_failed', message: '现有登录已保留' }), 'failed')).rejects.toThrow('现有登录已保留')
  })
  it.each([401, 403])('identifies an HTML login page with HTTP %s', async status => {
    await expect(readServiceJson(new Response('<html>Sign in</html>', { status }), 'failed')).rejects.toThrow('重新验证')
  })
  it.each(['null', '[]', 'broken'])('rejects malformed success payload %s', async body => {
    await expect(readServiceJson(new Response(body), 'failed')).rejects.toThrow('无效响应')
  })
})
