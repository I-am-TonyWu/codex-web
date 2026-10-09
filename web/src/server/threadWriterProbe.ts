type Rpc = (method: string, params: unknown) => Promise<unknown>
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' ? value as Record<string, unknown> : null

/** Explicit recheck only: native resume is authoritative; never interrupt an external writer. */
export async function recheckThreadWriter(threadId: string, rpc: Rpc) {
  let result: unknown
  try { result = await rpc('thread/resume', { threadId }) } catch (error) {
    if (/already has an active writer/iu.test(String(error))) return { activity: 'external', turnId: null }
    throw error
  }
  const body = record(result)
  if (body?.webReadOnlyReason === 'thread_writer_conflict') return { activity: 'external', turnId: null }
  const thread = record(body?.thread)
  const status = record(thread?.status)?.type
  if (body?.webExecutionSource === 'desktop') {
    const turn = Array.isArray(thread?.turns) ? [...thread.turns].reverse().map(record).find(t => t?.status === 'inProgress') : null
    return { activity: status === 'idle' || status === 'systemError' ? 'idle' : status === 'active' ? 'running' : 'unknown', turnId: typeof turn?.id === 'string' ? turn.id : null, executionSource: 'desktop' }
  }
  if (status === 'idle' || status === 'systemError') {
    // Checking should not leave a new idle writer behind or transfer a desktop task.
    await rpc('codexui/thread/release', { threadId })
    return { activity: 'idle', turnId: null }
  }
  const turn = Array.isArray(thread?.turns) ? [...thread.turns].reverse().map(record).find(t => t?.status === 'inProgress') : null
  return { activity: ['active', 'inProgress', 'running'].includes(String(status)) ? 'running' : 'unknown', turnId: typeof turn?.id === 'string' ? turn.id : null }
}
