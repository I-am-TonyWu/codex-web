import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { updateJsonState } from './jsonState.js'
import type { ProjectClient } from './nativeProjects.js'

const registryPath = (home: string) => join(home, 'webui-forked-threads.json')

export async function rememberForkedThread(home: string, id: string): Promise<void> {
  await updateJsonState(registryPath(home), state => {
    delete state[id]; state[id] = true
    for (const key of Object.keys(state).slice(0, -256)) delete state[key]
  })
}

export async function forgetForkedThread(home: string, id: string): Promise<void> {
  await updateJsonState(registryPath(home), state => { delete state[id]; return state })
}

// Some CLI versions can read a new fork by ID while omitting it from thread/list.
export async function includeForkedThreads(home: string, client: ProjectClient, payload: unknown): Promise<unknown> {
  const page = payload as { data?: { id: string }[] }
  if (!Array.isArray(page?.data)) return payload
  let ids: string[]
  try { ids = Object.keys(JSON.parse(await readFile(registryPath(home), 'utf8'))) } catch { return payload }
  const listed = new Set(page.data.map(thread => thread.id))
  const extra = await Promise.all(ids.filter(id => !listed.has(id)).map(async threadId => {
    try { return (await client.rpc('thread/read', { threadId, includeTurns: false }) as { thread?: { id: string; archived?: boolean; path?: string } }).thread }
    catch { return undefined }
  }))
  return { ...page, data: [...extra.filter(thread => thread && !thread.archived && !/(?:^|[/\\])archived_sessions[/\\]/u.test(thread.path ?? '')), ...page.data] }
}
