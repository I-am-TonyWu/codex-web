import type { ChildProcess } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'

/** Track close before shutdown: Windows SQLite handles outlive the exit event. */
export function trackAccountProcess(proc: ChildProcess) {
  let closed = false
  const close = new Promise<void>(settle => proc.once('close', () => { closed = true; settle() }))
  return {
    async stop() {
      if (closed) return true
      const wait = async (ms: number) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        try { await Promise.race([close, new Promise<void>(r => { timer = setTimeout(r, ms) })]) } finally { clearTimeout(timer) }
      }
      try { proc.stdin?.end(); proc.kill('SIGTERM') } catch { /* process may already have exited */ }
      await wait(3000)
      if (!closed) { try { proc.kill('SIGKILL') } catch { /* best effort */ } await wait(2000) }
      return closed
    },
  }
}

export async function cleanupAccountHome(path: string, processClosed: boolean) {
  const target = resolve(path)
  if (dirname(target) !== resolve(tmpdir()) || !/^codexui-(?:account|login)-/u.test(basename(target))) throw new Error('Invalid temporary account directory')
  if (!processClosed) { console.warn('[accounts] temporary process cleanup deferred'); return }
  try { await rm(target, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }) }
  catch { console.warn('[accounts] temporary directory cleanup deferred') }
}
