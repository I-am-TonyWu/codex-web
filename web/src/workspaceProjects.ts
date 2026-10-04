// Desktop project IDs and memberships are independent of a thread's execution cwd.
export type LocalWorkspaceProject = { id: string; name: string; rootPaths: string[] }
export type DesktopProjectMetadata = {
  localProjects?: LocalWorkspaceProject[]
  threadProjectAssignments?: Record<string, string>
  projectlessThreadIds?: string[]
  projectThreadOrders?: Record<string, string[]>
}
export type LocalProjectMutation =
  | { type: 'rename'; projectId: string; name: string }
  | { type: 'remove'; projectId: string }
  | { type: 'reorder'; projectIds: string[] }

export type ThreadProjectMutation = { threadId: string; projectId: string | null }

export function applyThreadProjectMutation(payload: Record<string, unknown>, mutation: ThreadProjectMutation): Record<string, unknown> {
  const { threadId, projectId } = mutation
  if (!threadId || threadId.length > 200 || threadId.trim() !== threadId || ['__proto__', 'constructor', 'prototype'].includes(threadId)) {
    throw new Error('Invalid thread ID')
  }
  const metadata = readDesktopProjectMetadata(payload)
  if (!metadata.localProjects) throw new Error('Update the desktop client to use project assignments')
  if (projectId !== null && !metadata.localProjects.some((project) => project.id === projectId)) {
    throw new Error('The local project no longer exists; refresh the project list')
  }
  const assignments = { ...record(payload['thread-project-assignments']) }
  if (record(assignments[threadId]).projectKind === 'chatgpt') throw new Error('ChatGPT conversations cannot be moved to local projects')
  const projectless = uniqueStrings(payload['projectless-thread-ids']).filter((id) => id !== threadId)
  const orders = Object.fromEntries(Object.entries(record(payload['sidebar-project-thread-orders'])).map(([id, value]) => {
    const order = record(value)
    return [id, { ...order, threadIds: uniqueStrings(order.threadIds).filter((item) => item !== threadId) }]
  }))
  if (projectId === null) {
    delete assignments[threadId]
    projectless.push(threadId)
  } else {
    assignments[threadId] = { projectKind: 'local', projectId }
    const order = record(orders[projectId])
    orders[projectId] = { ...order, threadIds: [threadId, ...uniqueStrings(order.threadIds)] }
  }
  return { ...payload, 'thread-project-assignments': assignments, 'projectless-thread-ids': projectless,
    'sidebar-project-thread-orders': orders,
    'thread-project-membership-host-ids': { ...record(payload['thread-project-membership-host-ids']), [threadId]: 'local' } }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
export function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && !!item.trim()).map((item) => item.trim()))] : []
}

export function normalizeProjectMetadata(value: unknown): DesktopProjectMetadata {
  const state = record(value)
  if (!Array.isArray(state.localProjects)) return {}
  const seen = new Set<string>()
  const localProjects = state.localProjects.flatMap((item) => {
    const project = record(item)
    const id = typeof project.id === 'string' ? project.id.trim() : ''
    if (!id || seen.has(id) || id.startsWith('g-p-')) return []
    seen.add(id)
    return [{ id, name: typeof project.name === 'string' ? project.name.trim() || id : id, rootPaths: uniqueStrings(project.rootPaths) }]
  })
  const threadProjectAssignments = Object.fromEntries(Object.entries(record(state.threadProjectAssignments))
    .filter(([threadId, projectId]) => !!threadId && typeof projectId === 'string' && seen.has(projectId))) as Record<string, string>
  const projectThreadOrders = Object.fromEntries(Object.entries(record(state.projectThreadOrders))
    .filter(([id]) => seen.has(id)).map(([id, order]) => [id, uniqueStrings(order)]))
  return { localProjects, threadProjectAssignments, projectlessThreadIds: uniqueStrings(state.projectlessThreadIds), projectThreadOrders }
}

export function readDesktopProjectMetadata(payload: Record<string, unknown>): DesktopProjectMetadata {
  // Old desktop versions have only saved workspace paths. Keep that fallback.
  if (!payload['local-projects'] || typeof payload['local-projects'] !== 'object' || Array.isArray(payload['local-projects'])) return {}
  const assignments = Object.fromEntries(Object.entries(record(payload['thread-project-assignments'])).flatMap(([id, value]) => {
    const assignment = record(value)
    return assignment.projectKind === 'local' && typeof assignment.projectId === 'string' ? [[id, assignment.projectId]] : []
  }))
  const orders = Object.fromEntries(Object.entries(record(payload['sidebar-project-thread-orders']))
    .map(([id, value]) => [id, record(value).threadIds]))
  return normalizeProjectMetadata({
    localProjects: Object.entries(record(payload['local-projects'])).map(([id, value]) => ({ ...record(value), id })),
    threadProjectAssignments: assignments,
    projectlessThreadIds: payload['projectless-thread-ids'],
    projectThreadOrders: orders,
  })
}

// Patch the latest desktop snapshot, never replace it with a browser's stale copy.
export function applyLocalProjectMutation(payload: Record<string, unknown>, mutation: LocalProjectMutation): Record<string, unknown> {
  const projects = { ...record(payload['local-projects']) }
  const metadata = readDesktopProjectMetadata(payload)
  const ids = new Set(metadata.localProjects?.map((project) => project.id) ?? [])
  if (mutation.type === 'reorder') {
    return { ...payload, 'project-order': [...uniqueStrings(mutation.projectIds).filter((id) => ids.has(id)),
      ...uniqueStrings(payload['project-order']).filter((id) => ids.has(id) && !mutation.projectIds.includes(id)),
      ...[...ids].filter((id) => !mutation.projectIds.includes(id) && !uniqueStrings(payload['project-order']).includes(id)),
      ...uniqueStrings(payload['project-order']).filter((id) => !ids.has(id))] }
  }
  if (!ids.has(mutation.projectId)) throw new Error('The local project no longer exists; refresh the project list')
  if (mutation.type === 'rename') {
    const name = mutation.name.trim()
    if (!name || name.length > 200) throw new Error('Project name must contain 1–200 characters')
    projects[mutation.projectId] = { ...record(projects[mutation.projectId]), name, updatedAt: Date.now() }
    return { ...payload, 'local-projects': projects }
  }
  delete projects[mutation.projectId]
  const assignments = { ...record(payload['thread-project-assignments']) }
  const projectless = uniqueStrings(payload['projectless-thread-ids'])
  for (const [id, value] of Object.entries(assignments)) {
    if (record(value).projectKind === 'local' && record(value).projectId === mutation.projectId) {
      delete assignments[id]
      if (!projectless.includes(id)) projectless.push(id)
    }
  }
  const orders = { ...record(payload['sidebar-project-thread-orders']) }
  delete orders[mutation.projectId]
  return { ...payload, 'local-projects': projects, 'project-order': uniqueStrings(payload['project-order']).filter((id) => id !== mutation.projectId),
    'thread-project-assignments': assignments, 'projectless-thread-ids': projectless, 'sidebar-project-thread-orders': orders }
}
