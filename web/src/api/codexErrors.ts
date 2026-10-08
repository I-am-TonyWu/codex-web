function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export type CodexErrorCode =
  | 'http_error'
  | 'rpc_error'
  | 'network_error'
  | 'invalid_response'
  | 'unknown_error'
  | 'thread_writer_conflict'

export const THREAD_WRITER_CONFLICT_MESSAGE = '此对话正由本机 Codex 客户端或另一个进程占用，网页暂时只能读取历史。可等待客户端释放此对话后重试，或点击“在网页接续”保留历史并创建独立分支。此条消息未发送。'

export function isThreadWriterConflict(value: unknown): boolean {
  if (value instanceof CodexApiError && value.code === 'thread_writer_conflict') return true
  const message = value instanceof Error ? value.message : typeof value === 'string' ? value : ''
  return /already has an active writer|thread_writer_conflict|此对话正由本机 Codex/iu.test(message)
}

export class CodexApiError extends Error {
  code: CodexErrorCode
  method?: string
  status?: number

  constructor(message: string, options: { code: CodexErrorCode; method?: string; status?: number }) {
    super(message)
    this.name = 'CodexApiError'
    this.code = options.code
    this.method = options.method
    this.status = options.status
  }
}

export function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.length > 0) return payload

  const record = asRecord(payload)
  if (!record) return fallback

  const error = record.error
  if (typeof error === 'string' && error.length > 0) {
    return error
  }

  const nested = asRecord(error)
  if (nested && typeof nested.message === 'string' && nested.message.length > 0) {
    return nested.message
  }

  if (typeof record.message === 'string' && record.message.length > 0) {
    return record.message
  }
  if (typeof record.detail === 'string' && record.detail.length > 0) return record.detail

  return fallback
}

export function normalizeCodexApiError(error: unknown, fallback: string, method?: string): CodexApiError {
  if (error instanceof CodexApiError) {
    return error
  }

  if (error instanceof Error) {
    return new CodexApiError(error.message || fallback, {
      code: 'unknown_error',
      method,
    })
  }

  return new CodexApiError(fallback, {
    code: 'unknown_error',
    method,
  })
}
