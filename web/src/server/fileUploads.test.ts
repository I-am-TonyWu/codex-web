import { expect, it, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { readUploadedFile } from './fileUploads'
import { readRequestBody } from './requestPolicy'
import { FILE_UPLOAD_MAX_BYTES, FILE_UPLOAD_TIMEOUT_MS } from '../shared/fileUpload'

async function upload(bytes: Uint8Array, filename: string) {
  const form = new FormData(); form.append('file', new Blob([bytes as Uint8Array<ArrayBuffer>]), filename)
  const encoded = new Response(form)
  const body = Buffer.from(await encoded.arrayBuffer())
  const req = Object.assign(new PassThrough(), { headers: { 'content-type': encoded.headers.get('content-type') }, aborted: false })
  const reading = readUploadedFile(req as unknown as IncomingMessage); req.end(body)
  return reading
}
it('preserves Chinese names, empty files and binary multipart-looking content', async () => {
  const data = Buffer.from('\0\xff\r\n--not-a-boundary\r\n数据')
  const result = await upload(data, '中文资料.pptx')
  expect(result.name).toBe('中文资料.pptx'); expect(result.data).toEqual(data)
  expect((await upload(new Uint8Array(), 'empty.txt')).data.length).toBe(0)
  expect((await upload(data, 'CON.txt')).name).toBe('_CON.txt')
})
it('accepts files larger than the old 32 MiB limit and rejects oversized request headers early', async () => {
  expect((await upload(Buffer.alloc(33 * 1024 * 1024, 7), 'large.bin')).data.length).toBe(33 * 1024 * 1024)
  const req = Object.assign(new PassThrough(), { headers: { 'content-length': FILE_UPLOAD_MAX_BYTES + 1024 * 1024 }, aborted: false })
  await expect(readUploadedFile(req as unknown as IncomingMessage)).rejects.toMatchObject({ statusCode: 413 })
})
it('keeps slow uploads alive beyond 30 seconds and still enforces their deadline', async () => {
  vi.useFakeTimers()
  try {
    const req = Object.assign(new PassThrough(), { headers: {}, aborted: false })
    const reading = readRequestBody(req as unknown as IncomingMessage, 1024, FILE_UPLOAD_TIMEOUT_MS)
    await vi.advanceTimersByTimeAsync(31_000); req.end('finished')
    expect((await reading).toString()).toBe('finished')
    const slow = Object.assign(new PassThrough(), { headers: {}, aborted: false })
    const timed = expect(readRequestBody(slow as unknown as IncomingMessage, 1024, FILE_UPLOAD_TIMEOUT_MS)).rejects.toMatchObject({ statusCode: 408 })
    await vi.advanceTimersByTimeAsync(FILE_UPLOAD_TIMEOUT_MS); await timed
  } finally { vi.useRealTimers() }
})
