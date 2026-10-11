import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), resolve: vi.fn(), rename: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('../commandResolution.js', () => ({ resolveCodexCommand: mocks.resolve }))
vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  mocks.rename.mockImplementation(original.rename)
  return { ...original, rename: mocks.rename }
})
import { handleAccountRoutes, withTemporaryCodexAppServer } from './accountRoutes'

const oldEnv = process.env.CODEX_HOME
let home: string, authRaw: string, spawned: any[], mode = 'normal'
const loginUrl = 'https://auth.openai.com/oauth/authorize?state=test-state&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback'
const callbackUrl = 'http://localhost:1455/auth/callback?state=test-state&code=fixture'
function auth(id = 'old') {
  const payload = { 'https://api.openai.com/profile': { email: `${id}@example.test` }, 'https://api.openai.com/auth': { user_id: id, chatgpt_plan_type: 'plus' } }
  return JSON.stringify({ auth_mode: 'chatgpt', tokens: { account_id: id, access_token: `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature` } })
}
function child(_command: string, args: string[], options: any) {
  const proc: any = new EventEmitter(); proc.stdout = new PassThrough(); proc.stderr = new PassThrough()
  proc.args = args; proc.options = options; proc.closed = false
  proc.stdin = new Writable({ write(chunk, _, next) {
    if (mode !== 'hang') for (const line of chunk.toString().trim().split('\n')) {
      const request = JSON.parse(line)
      if (typeof request.id === 'number') queueMicrotask(() => {
        proc.stdout.write(JSON.stringify({ id: request.id, result: request.method === 'account/read' ? { account: { type: 'chatgpt', email: 'new@example.test', planType: 'plus' } } : {} }) + '\n')
      })
    }
    next()
  } })
  proc.kill = vi.fn(() => { proc.emit('exit', null, 'SIGTERM'); setTimeout(() => { proc.closed = true; proc.emit('close', null, 'SIGTERM') }, 15); return true })
  spawned.push(proc)
  if (args.includes('login')) queueMicrotask(() => {
    if (mode === 'login-fail') { proc.emit('error', new Error('fixture login unavailable')); proc.emit('close', 1) }
    else proc.stdout.write(loginUrl + '\n')
  })
  return proc
}
const server = () => ({
  rpc: vi.fn(async (method: string) => method === 'account/read' ? { account: { type: 'chatgpt', email: 'old@example.test', planType: 'plus' } } : { rateLimits: { primary: { usedPercent: 12, windowDurationMins: 300 } } }),
  dispose: vi.fn(), listPendingServerRequests: vi.fn(() => []), hasActiveWork: vi.fn(async () => false),
})
async function request(path: string, appServer = server(), body?: any, method = 'POST') {
  const req: any = new PassThrough(); req.method = method
  let text = ''; const headers: Record<string, string> = {}
  const res: any = { statusCode: 200, setHeader: (key: string, value: string) => { headers[key] = value }, end: (value: string) => { text = value } }
  const promise = handleAccountRoutes(req as IncomingMessage, res as ServerResponse, new URL(path, 'http://fixture'), { appServer })
  req.end(body ? JSON.stringify(body) : '')
  expect(await promise).toBe(true)
  return { status: res.statusCode, headers, payload: JSON.parse(text) }
}
async function idle() {
  await vi.waitFor(async () => {
    const state = JSON.parse(await readFile(join(home, 'accounts.json'), 'utf8'))
    expect(state.accounts.every((a: any) => a.quotaStatus !== 'loading')).toBe(true)
  })
}
beforeEach(async () => {
  vi.useRealTimers(); mode = 'normal'; spawned = []; mocks.spawn.mockReset(); mocks.resolve.mockReset()
  mocks.resolve.mockReturnValue('C:\\fixture\\codex.exe'); mocks.spawn.mockImplementation(child)
  home = await mkdtemp(join(tmpdir(), 'codexui-account-test-')); process.env.CODEX_HOME = home
  authRaw = auth(); await writeFile(join(home, 'auth.json'), authRaw)
})
afterEach(async () => {
  vi.useRealTimers(); await request('/codex-api/accounts/login/cancel')
  vi.unstubAllGlobals()
  if (oldEnv === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = oldEnv
  // Test homes are generated inside tmpdir; no user credentials are used.
  await rm(home, { recursive: true, force: true })
})
describe('account reload and isolated login', () => {
  it('reloads while busy without disposing the runtime or altering auth', async () => {
    const app = server(); app.hasActiveWork.mockResolvedValue(true)
    const response = await request('/codex-api/accounts/refresh', app)
    expect(response.status).toBe(200); expect(response.headers['Cache-Control']).toBe('no-store')
    expect(response.payload.data.accounts).toHaveLength(1); expect(app.dispose).not.toHaveBeenCalled()
    await idle(); expect(app.rpc.mock.calls.map(c => c[0])).toEqual(['account/read', 'account/rateLimits/read'])
    expect(mocks.spawn).not.toHaveBeenCalled(); expect(await readFile(join(home, 'auth.json'), 'utf8')).toBe(authRaw)
  })
  it('keeps the active account if quota is temporarily unavailable', async () => {
    const app = server(); app.rpc.mockImplementation(async method => {
      if (method === 'account/rateLimits/read') throw new Error('network offline')
      return { account: { type: 'chatgpt', email: 'old@example.test', planType: 'plus' } }
    })
    await request('/codex-api/accounts/refresh', app); await idle()
    const list = await request('/codex-api/accounts', app, undefined, 'GET')
    expect(list.payload.data.accounts[0]).toMatchObject({ isActive: true, quotaStatus: 'error', unavailableReason: null })
    expect(list.payload.data.accounts[0].quotaError).toContain('仍然有效')
    expect(app.dispose).not.toHaveBeenCalled(); expect(await readFile(join(home, 'auth.json'), 'utf8')).toBe(authRaw)
  })
  it('returns JSON HTTP 200 operational failure when desktop auth is missing, retaining the snapshot', async () => {
    const app = server(); await request('/codex-api/accounts/refresh', app); await idle()
    await rm(join(home, 'auth.json'))
    const response = await request('/codex-api/accounts/refresh', app)
    expect(response.status).toBe(200); expect(response.payload.ok).toBe(false)
    expect(response.payload.message).toContain('已保留'); expect(app.dispose).not.toHaveBeenCalled()
    expect(JSON.parse(await readFile(join(home, 'accounts.json'), 'utf8')).accounts).toHaveLength(1)
  })
  it('starts with the resolved CLI in an isolated home, and waits for cleanup on cancel', async () => {
    const response = await request('/codex-api/accounts/login/start')
    expect(response.payload.data.loginUrl).toBe(loginUrl)
    expect(mocks.spawn.mock.calls[0][0]).toBe('C:\\fixture\\codex.exe')
    const proc = spawned[0]; expect(proc.options.windowsHide).toBe(true); expect(proc.options.env.CODEX_HOME).not.toBe(home)
    await request('/codex-api/accounts/login/cancel'); expect(proc.closed).toBe(true)
    await expect(readFile(join(proc.options.env.CODEX_HOME, 'auth.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(home, 'auth.json'), 'utf8')).toBe(authRaw)
  })
  it('reports login startup failure as JSON and retains the working login', async () => {
    mode = 'login-fail'
    const response = await request('/codex-api/accounts/login/start')
    expect(response.status).toBe(200); expect(response.payload.ok).toBe(false)
    expect(await readFile(join(home, 'auth.json'), 'utf8')).toBe(authRaw)
  })
  it('rejects a callback from a different login or port before making any request', async () => {
    await request('/codex-api/accounts/login/start'); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const response = await request('/codex-api/accounts/login/complete', server(), { callbackUrl: 'http://localhost:9999/auth/callback?state=test-state' })
    expect(response.status).toBe(400); expect(fetch).not.toHaveBeenCalled()
    expect(await readFile(join(home, 'auth.json'), 'utf8')).toBe(authRaw)
  })
  it('refuses account activation while a task is active', async () => {
    await request('/codex-api/accounts/login/start'); const app = server(); app.hasActiveWork.mockResolvedValue(true)
    const response = await request('/codex-api/accounts/login/complete', app, { callbackUrl })
    expect(response.status).toBe(409); expect(app.dispose).not.toHaveBeenCalled()
    expect(await readFile(join(home, 'auth.json'), 'utf8')).toBe(authRaw)
  })
  it('preserves the old login when the localhost callback fails', async () => {
    await request('/codex-api/accounts/login/start'); const app = server()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('callback failed', { status: 500 })))
    const response = await request('/codex-api/accounts/login/complete', app, { callbackUrl })
    expect(response.status).toBe(200); expect(response.payload.ok).toBe(false)
    expect(app.dispose).not.toHaveBeenCalled(); expect(await readFile(join(home, 'auth.json'), 'utf8')).toBe(authRaw)
  })
  it('activates a validated login even if its local callback already finished', async () => {
    await request('/codex-api/accounts/login/start'); const proc = spawned[0]
    await writeFile(join(proc.options.env.CODEX_HOME, 'auth.json'), auth('new'))
    proc.emit('exit', 0); proc.closed = true; proc.emit('close', 0)
    const app = server(); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const response = await request('/codex-api/accounts/login/complete', app, { callbackUrl })
    expect(response.status).toBe(200); expect(response.payload.ok).toBe(true)
    expect(JSON.parse(await readFile(join(home, 'auth.json'), 'utf8')).tokens.account_id).toBe('new')
    expect(app.dispose).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled(); await idle()
  })
  it('rolls back auth if the final account-state commit fails', async () => {
    await request('/codex-api/accounts/login/start'); const proc = spawned[0]
    await writeFile(join(proc.options.env.CODEX_HOME, 'auth.json'), auth('new'))
    const originalRename = mocks.rename.getMockImplementation()!
    let failed = false
    mocks.rename.mockImplementation(async (source, target) => {
      if (!failed && target === join(home, 'accounts.json') && await readFile(join(home, 'auth.json'), 'utf8') === auth('new')) {
        failed = true; throw new Error('fixture disk error')
      }
      return originalRename(source, target)
    })
    try {
      const app = server(); const response = await request('/codex-api/accounts/login/complete', app, { callbackUrl })
      expect(failed).toBe(true); expect(response.status).toBe(200); expect(response.payload.ok).toBe(false)
      expect(await readFile(join(home, 'auth.json'), 'utf8')).toBe(authRaw)
      expect(app.dispose).not.toHaveBeenCalled()
    } finally { mocks.rename.mockImplementation(originalRename) }
  })
  it('serializes simultaneous start requests into one isolated login', async () => {
    const responses = await Promise.all([request('/codex-api/accounts/login/start'), request('/codex-api/accounts/login/start')])
    expect(responses.every(r => r.payload.data.loginUrl === loginUrl)).toBe(true)
    expect(mocks.spawn).toHaveBeenCalledTimes(1)
  })
  it('waits for child close and removes the real temporary directory after inspection', async () => {
    expect(await withTemporaryCodexAppServer(authRaw, rpc => rpc('account/read', { refreshToken: false }))).toMatchObject({ account: { type: 'chatgpt' } })
    const proc = spawned[0]; expect(proc.closed).toBe(true)
    await expect(readFile(join(proc.options.env.CODEX_HOME, 'auth.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('terminates and cleans up an inspection that times out', async () => {
    vi.useFakeTimers(); mode = 'hang'
    const operation = withTemporaryCodexAppServer(authRaw, rpc => rpc('account/read', {}))
    const rejected = expect(operation).rejects.toThrow('超时')
    await vi.waitFor(() => expect(spawned).toHaveLength(1)); await vi.advanceTimersByTimeAsync(25_030)
    await rejected; expect(spawned[0].closed).toBe(true)
    await expect(readFile(join(spawned[0].options.env.CODEX_HOME, 'auth.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
