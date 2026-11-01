import { createHash } from 'node:crypto'
import { extname, isAbsolute } from 'node:path'
import { readFile, realpath, stat } from 'node:fs/promises'
import express from 'express'
import { createDirectoryListingHtml, createTextEditorHtml, decodeBrowsePath, getLocalDirectoryListing, isTextEditableFile, normalizeLocalPath } from './localBrowseUi.js'
import { replaceFileSnapshot, serializeFileUpdate } from './jsonState.js'

function fileRevision(content: string): string { return createHash('sha256').update(content).digest('hex') }

function protectFileResponse(res: import('express').Response, path: string, download = false): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'")
  if (download || !['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.webp', '.pdf', '.txt', '.mp3', '.mp4', '.wav', '.webm'].includes(extname(path).toLowerCase())) res.attachment(path)
}

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function normalizeLocalImagePath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('file://')) {
    try {
      return decodeURIComponent(trimmed.replace(/^file:\/\//u, ''))
    } catch {
      return trimmed.replace(/^file:\/\//u, '')
    }
  }
  return trimmed
}

function readWildcardPathParam(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join('/')
  return ''
}

export function createLocalFileRouter() {
  const router = express.Router()
  // 3. Serve local images referenced in markdown (desktop parity for absolute image paths)
  router.get('/codex-local-image', (req, res) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
    const localPath = normalizeLocalImagePath(rawPath)
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local file path.' })
      return
    }

    const contentType = IMAGE_CONTENT_TYPES[extname(localPath).toLowerCase()]
    if (!contentType) {
      res.status(415).json({ error: 'Unsupported image type.' })
      return
    }

    protectFileResponse(res, localPath)
    res.type(contentType)
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.sendFile(localPath, { dotfiles: 'allow' }, (error) => {
      if (!error) return
      if (!res.headersSent) res.status(404).json({ error: 'Image file not found.' })
    })
  })

  // 4. Serve local files inline for direct file open.
  router.get('/codex-local-file', (req, res) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
    const localPath = normalizeLocalPath(rawPath)
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local file path.' })
      return
    }

    res.setHeader('Cache-Control', 'private, no-store')
    protectFileResponse(res, localPath)
    res.sendFile(localPath, { dotfiles: 'allow' }, (error) => {
      if (!error) return
      if (!res.headersSent) res.status(404).json({ error: 'File not found.' })
    })
  })

  // 5. Return JSON directory listings for the integrated folder picker.
  router.get('/codex-local-directories', async (req, res) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
    const showHidden = typeof req.query.showHidden === 'string'
      && ['1', 'true', 'yes', 'on'].includes(req.query.showHidden.toLowerCase())
    const localPath = normalizeLocalPath(rawPath)
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local directory path.' })
      return
    }

    try {
      const fileStat = await stat(localPath)
      if (!fileStat.isDirectory()) {
        res.status(400).json({ error: 'Expected directory path.' })
        return
      }
      const data = await getLocalDirectoryListing(localPath, { showHidden })
      res.status(200).json({ data })
    } catch {
      res.status(404).json({ error: 'Directory not found.' })
    }
  })

  // 6. Serve local files by path to preserve relative asset loading for HTML.
  router.get('/codex-local-browse/*path', async (req, res) => {
    const rawPath = readWildcardPathParam(req.params.path)
    const localPath = decodeBrowsePath(`/${rawPath}`, true)
    const newProjectName = typeof req.query.newProjectName === 'string' ? req.query.newProjectName : ''
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local file path.' })
      return
    }

    try {
      const fileStat = await stat(localPath)
      res.setHeader('Cache-Control', 'private, no-store')
      if (fileStat.isDirectory()) {
        const html = await createDirectoryListingHtml(localPath, { newProjectName })
        res.status(200).type('text/html; charset=utf-8').send(html)
        return
      }

      protectFileResponse(res, localPath)
      if (req.query.download === '1') { res.download(localPath); return }
      res.sendFile(localPath, { dotfiles: 'allow' }, (error) => {
        if (!error) return
        if (!res.headersSent) res.status(404).json({ error: 'File not found.' })
      })
    } catch {
      res.status(404).json({ error: 'File not found.' })
    }
  })

  // 7. Edit text-like local files.
  router.get('/codex-local-edit/*path', async (req, res) => {
    const rawPath = readWildcardPathParam(req.params.path)
    const localPath = decodeBrowsePath(`/${rawPath}`, true)
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local file path.' })
      return
    }
    try {
      const fileStat = await stat(localPath)
      if (!fileStat.isFile()) {
        res.status(400).json({ error: 'Expected file path.' })
        return
      }
      const html = await createTextEditorHtml(localPath)
      res.status(200).type('text/html; charset=utf-8').send(html)
    } catch {
      res.status(404).json({ error: 'File not found.' })
    }
  })

  router.put('/codex-local-edit/*path', express.text({ type: '*/*', limit: '10mb' }), async (req, res) => {
    const rawPath = readWildcardPathParam(req.params.path)
    const localPath = decodeBrowsePath(`/${rawPath}`, true)
    if (!localPath || !isAbsolute(localPath)) {
      res.status(400).json({ error: 'Expected absolute local file path.' })
      return
    }
    if (!(await isTextEditableFile(localPath))) {
      res.status(415).json({ error: 'Only text-like files are editable.' })
      return
    }
    const body = typeof req.body === 'string' ? req.body : ''
    try {
      const revision = typeof req.headers['if-match'] === 'string' ? req.headers['if-match'] : ''
      if (!revision) { res.status(428).json({ error: 'Missing file revision; reload before saving.' }); return }
      const targetPath = await realpath(localPath)
      await serializeFileUpdate(targetPath, async () => {
        const snapshot = await readFile(targetPath, 'utf8')
        if (fileRevision(snapshot) !== revision) throw new Error('File changed; reload before saving. Your text has not been saved.')
        await replaceFileSnapshot(targetPath, snapshot, body)
      })
      res.status(200).json({ ok: true, revision: fileRevision(body) })
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : 'Save failed' })
    }
  })

  return router
}
