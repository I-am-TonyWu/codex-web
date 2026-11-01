import express from 'express'
import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createLocalFileRouter } from './localFileRoutes'
import { requestPolicy, readRequestBody, HttpError } from './requestPolicy'
import { attachNotificationsWebSocket } from './webSocket'
import { handleSkillsRoutes, invalidateInstalledSkillsCache } from './skillsRoutes'
import { waitForSkillTranslations } from './skillPresentation'

let home: string, base: string, server: Server
let disposeWs = () => {}
const appServer = { rpc: vi.fn(async (_method: string, _params: unknown) => ({ data: [] })) }
const translate = vi.fn(async (source: { description: string; content: string }) => ({ ...source, description: '中文说明', content: source.content ? '中文全文' : '' }))
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'codex-optimization-'))
  vi.stubEnv('CODEX_HOME', home)
  appServer.rpc.mockClear(); translate.mockClear(); invalidateInstalledSkillsCache(appServer)
  const app = express()
  app.use(requestPolicy, createLocalFileRouter())
  app.post('/codex-api/body', async (req, res) => {
    try { res.json({ length: (await readRequestBody(req, 8)).length }) }
    catch (error) { res.status(error instanceof HttpError ? error.statusCode : 500).end() }
  })
  app.post('/codex-api/upload-file', async (req, res) => { res.json({ bytes: (await readRequestBody(req, 1024)).length }) })
  app.use((req, res, next) => {
    void handleSkillsRoutes(req, res, new URL(req.url, base), {
      appServer, readJsonBody: async req => JSON.parse((await readRequestBody(req)).toString()), translateSkillText: translate,
    }).then(handled => { if (!handled) next() })
  })
  server = createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
})
afterEach(async () => {
  disposeWs(); disposeWs = () => {}
  await waitForSkillTranslations()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  vi.unstubAllEnvs()
  await rm(home, { recursive: true, force: true })
})
const post = (route: string, body: unknown, origin = base, type = 'application/json') =>
  fetch(base + route, { method: 'POST', headers: { Origin: origin, 'Content-Type': type }, body: JSON.stringify(body) })

it('rejects cross-origin writes and simple text JSON before a deletion can run', async () => {
  const outside = join(home, 'outside')
  await mkdir(outside)
  expect((await post('/codex-api/skills-hub/uninstall', { path: outside }, 'http://untrusted.example', 'text/plain')).status).toBe(403)
  expect((await post('/codex-api/skills-hub/uninstall', { path: outside }, base, 'text/plain')).status).toBe(415)
  expect((await post('/codex-api/skills-hub/uninstall', { path: outside })).status).toBe(403)
  expect((await post('/codex-api/skills-hub/uninstall', { name: '../outside' })).status).toBe(403)
  expect((await stat(outside)).isDirectory()).toBe(true)
})
it('removes only a discovered personal skill and rejects links outside its root', async () => {
  const skill = join(home, 'skills', 'safe')
  await mkdir(skill, { recursive: true }); await writeFile(join(skill, 'SKILL.md'), '中文说明')
  const outside = join(home, 'outside')
  await mkdir(outside); await writeFile(join(outside, 'SKILL.md'), '中文')
  await symlink(outside, join(home, 'skills', 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  expect((await post('/codex-api/skills-hub/uninstall', { path: join(home, 'skills', 'linked', 'SKILL.md') })).status).toBe(403)
  expect(await readFile(join(outside, 'SKILL.md'), 'utf8')).toBe('中文')
  expect((await post('/codex-api/skills-hub/uninstall', { path: join(skill, 'SKILL.md').replace(/\//g, '\\') })).status).toBe(200)
  await expect(readFile(join(skill, 'SKILL.md'))).rejects.toThrow()
})
it('shares discovery while card polling translates descriptions rather than all skill bodies', async () => {
  const skill = join(home, 'skills', 'card')
  await mkdir(skill, { recursive: true })
  await writeFile(join(skill, 'SKILL.md'), '---\nname: card\ndescription: Inspect this full report.\n---\nFull long document to translate when opened.')
  await Promise.all([fetch(base + '/codex-api/skills-hub'), fetch(base + '/codex-api/skills-hub')])
  await waitForSkillTranslations()
  expect(translate).toHaveBeenCalledTimes(1)
  expect(translate.mock.calls[0]![0].content).toBe('')
  const detail = await (await fetch(base + '/codex-api/skills-hub/readme?owner=local&name=card&installed=true')).json() as { originalContent: string }
  expect(detail.originalContent).toContain('Full long document to translate when opened.')
  await waitForSkillTranslations()
  expect(translate.mock.calls.at(-1)![0].content).toContain('Full long document')
  expect(appServer.rpc.mock.calls.filter(call => call[0] === 'skills/list')).toHaveLength(1)
})
it('serves active files as downloads with a restrictive sandbox, while ordinary images stay inline', async () => {
  for (const name of ['sample.html', 'sample.svg']) {
    const file = join(home, name); await writeFile(file, '<script>fetch("/codex-api/rpc")</script>')
    const response = await fetch(base + '/codex-local-file?path=' + encodeURIComponent(file))
    expect(response.headers.get('content-disposition')).toMatch(/^attachment/)
    expect(response.headers.get('content-security-policy')).toContain('sandbox')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  }
  const file = join(home, 'image.png'); await writeFile(file, 'fixture')
  expect((await fetch(base + '/codex-local-image?path=' + encodeURIComponent(file))).headers.get('content-type')).toBe('image/png')
})
it('edits offline and refuses stale revisions without overwriting another editor', async () => {
  const file = join(home, 'edit.txt'); await writeFile(file, 'original')
  const route = '/codex-local-edit/' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')
  const html = await (await fetch(base + route)).text()
  expect(html).toContain('<textarea'); expect(html).not.toContain('cdnjs.cloudflare.com')
  const revision = createHash('sha256').update('original').digest('hex')
  const save = (text: string, match?: string) => fetch(base + route, { method: 'PUT', headers: { Origin: base, 'Content-Type': 'text/plain', ...(match ? { 'If-Match': match } : {}) }, body: text })
  expect((await save('bad')).status).toBe(428)
  expect((await save('first', revision)).status).toBe(200)
  await writeFile(file, 'external change')
  expect((await save('stale', revision)).status).toBe(409)
  expect(await readFile(file, 'utf8')).toBe('external change')
})
it('bounds bodies with and without Content-Length', async () => {
  expect((await post('/codex-api/body', '0123456789')).status).toBe(413)
  const response = await fetch(base + '/codex-api/body', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('0123456789')); controller.close() } }), duplex: 'half' } as RequestInit)
  expect(response.status).toBe(413)
})
it('allows the actual multipart attachment endpoint while retaining its byte limit', async () => {
  const body = new FormData()
  body.append('file', new File(['attachment fixture'], 'sample.txt'))
  const response = await fetch(base + '/codex-api/upload-file', { method: 'POST', headers: { Origin: base }, body })
  expect(response.status).toBe(200)
  expect(((await response.json()) as { bytes: number }).bytes).toBeGreaterThan(18)
})
it('rejects external WS origins and releases subscriptions on disposal and expired sessions', async () => {
  let authorized = true
  let notify!: (value: unknown) => void
  const cleanup = vi.fn()
  const subscribe = vi.fn((listener: (value: unknown) => void) => { notify = listener; return cleanup })
  disposeWs = attachNotificationsWebSocket(server, subscribe, () => authorized)
  const rejected = new WebSocket(base.replace('http:', 'ws:') + '/codex-api/ws', { origin: 'http://untrusted.example' })
  await expect(new Promise((resolve, reject) => { rejected.on('open', resolve); rejected.on('error', reject) })).rejects.toThrow('403')
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/codex-api/ws', { origin: base })
  await new Promise(resolve => ws.once('message', resolve))
  expect(subscribe).toHaveBeenCalledTimes(1)
  const closed = new Promise(resolve => ws.once('close', resolve))
  authorized = false
  notify({ method: 'fixture' })
  await closed
  await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1))
  authorized = true
  const second = new WebSocket(base.replace('http:', 'ws:') + '/codex-api/ws', { origin: base })
  await new Promise(resolve => second.once('message', resolve))
  const secondClosed = new Promise(resolve => second.once('close', resolve))
  disposeWs()
  await secondClosed
  expect(cleanup).toHaveBeenCalledTimes(2)
})
