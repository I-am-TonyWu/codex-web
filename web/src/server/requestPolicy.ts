import type { IncomingMessage } from 'node:http'
import type { RequestHandler } from 'express'

export class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message) }
}

export function isRequestOriginAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (!origin) return !['cross-site', 'same-site'].includes(String(req.headers['sec-fetch-site']))
  try {
    const url = new URL(origin)
    const forwarded = req.headers['x-forwarded-proto']
    const protocol = forwarded === 'https' || forwarded === 'http' ? forwarded + ':'
      : (req.socket as { encrypted?: boolean }).encrypted ? 'https:' : 'http:'
    return url.origin === origin && url.host.toLowerCase() === req.headers.host?.toLowerCase() && url.protocol === protocol
  } catch { return false }
}

export const requestPolicy: RequestHandler = (req, res, next) => {
  const writes = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
  if ((writes || req.path.startsWith('/codex-api/')) && !isRequestOriginAllowed(req)) {
    res.status(403).json({ error: 'Request origin is not allowed.' }); return
  }
  if (writes && (req.path.startsWith('/codex-api/') || req.path === '/auth/login')) {
    const type = (req.headers['content-type'] || '').split(';')[0]?.trim().toLowerCase()
    const upload = ['/codex-api/upload-file', '/codex-api/transcribe'].includes(req.path)
    const zip = req.path === '/codex-api/project-import' && ['application/zip', 'application/octet-stream', 'application/x-zip-compressed'].includes(type || '')
    if (type !== 'application/json' && !(upload && (type === 'multipart/form-data' || (req.path === '/codex-api/transcribe' && ['application/octet-stream', 'audio/webm', 'audio/mp4', 'audio/wav'].includes(type || '')))) && !zip) {
      res.status(415).json({ error: 'Unsupported request content type.' }); return
    }
  }
  next()
}

export function readRequestBody(req: IncomingMessage, limit = 2 * 1024 * 1024, timeoutMs = 30_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    const finish = (error?: Error) => {
      clearTimeout(timer)
      req.off('data', data); req.off('end', end); req.off('error', fail); req.off('aborted', aborted)
      if (error) { chunks.length = 0; req.once('error', () => undefined); req.resume(); reject(error) }
      else resolve(Buffer.concat(chunks, size))
    }
    const data = (value: Buffer | string) => {
      const chunk = typeof value === 'string' ? Buffer.from(value) : value
      size += chunk.length
      if (size > limit) finish(new HttpError(413, 'Request body is too large.'))
      else chunks.push(chunk)
    }
    const end = () => finish()
    const fail = (error: Error) => finish(error)
    const aborted = () => finish(new HttpError(400, 'Request was interrupted.'))
    const timer = setTimeout(() => finish(new HttpError(408, 'Request body timed out.')), timeoutMs)
    timer.unref()
    req.on('data', data); req.once('end', end); req.once('error', fail); req.once('aborted', aborted)
    if (req.aborted) aborted()
    else if (Number(req.headers['content-length']) > limit) finish(new HttpError(413, 'Request body is too large.'))
  })
}
