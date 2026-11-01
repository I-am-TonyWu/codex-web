import type { LocalWorkspaceProject } from '../workspaceProjects.js'
import { normalizePathForComparison } from '../pathUtils.js'

export type ProjectClient = { rpc(method: string, params: unknown): Promise<unknown> }
export type NativeProject = { id: string; name?: string; roots?: { path: string }[]; metadata?: Record<string, string> }

export async function listNativeProjects(client: ProjectClient): Promise<NativeProject[]> {
  const projects: NativeProject[] = []
  const cursors = new Set<string>()
  let cursor: string | null = null
  do {
    const page = await client.rpc('project/list', { cursor, limit: 100 }) as { data: NativeProject[]; nextCursor?: string | null }
    if (!Array.isArray(page?.data)) throw new Error('Codex 项目列表不可用，请更新客户端后重试。')
    projects.push(...page.data)
    cursor = page.nextCursor ?? null
    if (cursor && (cursors.has(cursor) || cursors.size >= 100)) throw new Error('Codex 项目列表未能完整读取。')
    if (cursor) cursors.add(cursor)
  } while (cursor)
  return projects
}

export function matchNativeProject(projects: NativeProject[], local: LocalWorkspaceProject): NativeProject | undefined {
  const exact = projects.find(project => project.id === local.id || project.metadata?.['codex.localProjectId'] === local.id)
  if (exact) return exact
  const rootsKey = (paths: string[]) => JSON.stringify([...new Set(paths.map(path => normalizePathForComparison(path).replace(/\/$/u, '')))].sort())
  if (!local.rootPaths.length) return undefined
  const localRoots = rootsKey(local.rootPaths)
  const matches = projects.filter(project => rootsKey(project.roots?.map(root => root.path) ?? []) === localRoots)
  if (matches.length === 1) return matches[0]
  const namedMatches = matches.filter(project => project.name === local.name)
  return namedMatches.length === 1 ? namedMatches[0] : undefined
}

export async function resolveNativeProject(client: ProjectClient, local: LocalWorkspaceProject): Promise<string> {
  const existing = matchNativeProject(await listNativeProjects(client), local)
  if (existing) return existing.id
  const result = await client.rpc('project/import', { idempotencyKey: local.id, name: local.name,
    roots: local.rootPaths.map(path => ({ path })), metadata: { 'codex.localProjectId': local.id } }) as { project?: NativeProject }
  if (!result.project?.id) throw new Error('Codex 项目同步失败，请刷新后重试。')
  return result.project.id
}

export async function saveNativeThreadProject(client: ProjectClient, threadId: string, projectId: string | null): Promise<void> {
  await client.rpc('thread/metadata/update', { threadId, projectId: projectId ?? '' })
  const saved = await client.rpc('thread/read', { threadId, includeTurns: false }) as { thread?: { projectId?: string | null } }
  if (saved.thread?.projectId !== projectId) throw new Error('Codex 未确认项目归属，保存结果待核对，请刷新后重试。')
}
