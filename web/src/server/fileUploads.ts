import type { IncomingMessage } from 'node:http'
import { FILE_UPLOAD_MAX_BYTES, FILE_UPLOAD_TIMEOUT_MS } from '../shared/fileUpload.js'
import { HttpError, readRequestBody } from './requestPolicy.js'

export async function readUploadedFile(req: IncomingMessage): Promise<{ name: string; data: Buffer }> {
  const body = await readRequestBody(req, FILE_UPLOAD_MAX_BYTES + 64 * 1024, FILE_UPLOAD_TIMEOUT_MS)
  let form: FormData
  try {
    form = await new Response(new Uint8Array(body), { headers: { 'Content-Type': req.headers['content-type'] || '' } }).formData()
  } catch { throw new HttpError(400, '文件上传格式不完整，请重新选择文件。') }
  const file = form.get('file')
  if (!file || typeof file === 'string') throw new HttpError(400, '请求中没有文件。')
  if (file.size > FILE_UPLOAD_MAX_BYTES) throw new HttpError(413, '单个文件最大支持 90 MiB，请压缩或拆分后上传。')
  let name = file.name.replace(/[<>:"/\\|?*\x00-\x1f]/gu, '_').replace(/[. ]+$/gu, '')
  if (!name) name = 'uploaded-file'
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name)) name = '_' + name
  return { name, data: Buffer.from(await file.arrayBuffer()) }
}
