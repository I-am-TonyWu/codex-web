import express from 'express'
import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createAuthSession } from './authMiddleware'
let home: string, server: Server, base: string
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'codex-auth-limit-')); vi.stubEnv('CODEX_HOME', home)
  const app = express()
  app.use((req, _res, next) => { Object.defineProperty(req.socket, 'remoteAddress', { value: '192.0.2.1', configurable: true }); next() })
  app.use(createAuthSession('fixture-password').middleware)
  server = createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
})
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); vi.unstubAllEnvs(); await rm(home, { recursive: true, force: true }) })
const login = (body: string, origin = base) => fetch(base + '/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body })
it('limits login bytes and rejects cross-origin password submission', async () => {
  expect((await login(JSON.stringify({ password: 'x'.repeat(9000) }))).status).toBe(413)
  expect((await login('{"password":"fixture-password"}', 'http://untrusted.example')).status).toBe(403)
  const response = await login('{"password":"fixture-password"}')
  expect(response.status).toBe(200); expect(response.headers.get('set-cookie')).toContain('HttpOnly')
})
it('throttles failed attempts before an unlimited password loop', async () => {
  for (let i = 0; i < 20; i++) expect((await login('{"password":"wrong"}')).status).toBe(401)
  const response = await login('{"password":"wrong"}')
  expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('300')
})
