import type { IncomingMessage, Server } from 'node:http'
import { WebSocketServer } from 'ws'
import { isRequestOriginAllowed } from './requestPolicy.js'

type Subscribe = (listener: (notification: unknown) => void) => () => void

export function attachNotificationsWebSocket(server: Server, subscribe: Subscribe, authorized = (_req: IncomingMessage) => true): () => void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })
  const cleanups = new Set<() => void>()
  let disposed = false
  const upgrade = (req: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => {
    if (req.url?.split('?')[0] !== '/codex-api/ws') return
    if (!isRequestOriginAllowed(req) || !authorized(req)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return
    }
    wss.handleUpgrade(req, socket, head, ws => {
      let alive = true
      ws.on('pong', () => { alive = true })
      ws.send(JSON.stringify({ method: 'ready', params: { ok: true }, atIso: new Date().toISOString() }))
      const unsubscribe = subscribe(notification => {
        if (ws.readyState !== 1) return
        if (!authorized(req) || ws.bufferedAmount > 4 * 1024 * 1024) { ws.terminate(); return }
        ws.send(JSON.stringify(notification))
      })
      const heartbeat = setInterval(() => {
        if (!alive || !authorized(req)) { ws.terminate(); return }
        alive = false; ws.ping()
      }, 30_000)
      heartbeat.unref()
      let closed = false
      const close = () => { if (closed) return; closed = true; clearInterval(heartbeat); unsubscribe(); cleanups.delete(close) }
      cleanups.add(close)
      ws.once('close', close); ws.once('error', close)
    })
  }
  server.on('upgrade', upgrade)
  const dispose = () => {
    if (disposed) return
    disposed = true
    server.off('upgrade', upgrade)
    server.off('close', dispose)
    for (const close of cleanups) close()
    for (const ws of wss.clients) ws.terminate()
    wss.close()
  }
  server.once('close', dispose)
  return dispose
}
