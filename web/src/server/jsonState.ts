import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const writes = new Map<string, Promise<unknown>>()

export function serializeFileUpdate<T>(path: string, action: () => Promise<T>): Promise<T> {
  const key = process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
  const run = (writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(action)
  writes.set(key, run)
  void run.finally(() => { if (writes.get(key) === run) writes.delete(key) }).catch(() => undefined)
  return run
}

export async function readStateSnapshot(path: string): Promise<string | null> {
  try { return await readFile(path, 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}

export function parseJsonState(snapshot: string | null): Record<string, unknown> {
  const value: unknown = snapshot === null ? {} : JSON.parse(snapshot)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid desktop state; refusing to overwrite it')
  return value as Record<string, unknown>
}

export async function replaceFileSnapshot(path: string, snapshot: string | null, content: string): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  try {
    await mkdir(dirname(path), { recursive: true })
    const mode = await stat(path).then(info => info.mode & 0o777).catch(error => { if (error.code === 'ENOENT') return 0o600; throw error })
    if ((mode & 0o222) === 0) throw new Error('File is read-only; refusing to replace it')
    await writeFile(temporaryPath, content, { encoding: 'utf8', mode, flush: true })
    // The desktop does not share our lock; reject observed conflicts before replacement.
    if (await readStateSnapshot(path) !== snapshot) throw new Error('File changed; refresh and retry')
    await rename(temporaryPath, path)
  } finally { await rm(temporaryPath, { force: true }).catch(() => undefined) }
}

export function updateJsonState<T>(path: string, update: (state: Record<string, unknown>) => T | Promise<T>): Promise<T> {
  return serializeFileUpdate(path, async () => {
    const snapshot = await readStateSnapshot(path)
    const state = parseJsonState(snapshot)
    const result = await update(state)
    await replaceFileSnapshot(path, snapshot, JSON.stringify(state))
    return result
  })
}
