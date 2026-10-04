import { describe, expect, it } from 'vitest'
import { applyLocalProjectMutation, applyThreadProjectMutation, normalizeProjectMetadata, readDesktopProjectMetadata } from './workspaceProjects'

const desktop = () => ({
  'local-projects': {
    alpha: { id: 'alpha', name: '中文项目', rootPaths: ['C:\\Projects\\alpha'], createdAt: 10, other: 'preserve' },
    beta: { id: 'beta', name: 'Beta', rootPaths: ['C:\\Projects\\beta'] },
    'g-p-cloud': { id: 'g-p-cloud', name: 'Cloud chat', rootPaths: ['C:\\ChatCloud'] },
  },
  'project-order': ['beta', 'alpha', 'old-path', 'g-p-cloud'],
  'thread-project-assignments': { one: { projectKind: 'local', projectId: 'alpha' }, two: { projectKind: 'chatgpt', projectId: 'g-p-cloud' } },
  'sidebar-project-thread-orders': { alpha: { threadIds: ['one'] } },
  'projectless-thread-ids': ['free'],
  unrelated: { keep: true },
})

describe('desktop project metadata', () => {
  it('reads modern project IDs, memberships and thread ordering without treating cloud chats as local work', () => {
    expect(readDesktopProjectMetadata(desktop())).toEqual({
      localProjects: [
        { id: 'alpha', name: '中文项目', rootPaths: ['C:\\Projects\\alpha'] },
        { id: 'beta', name: 'Beta', rootPaths: ['C:\\Projects\\beta'] },
      ],
      threadProjectAssignments: { one: 'alpha' }, projectlessThreadIds: ['free'], projectThreadOrders: { alpha: ['one'] },
    })
  })
  it('distinguishes an empty modern store from the legacy fallback', () => {
    expect(readDesktopProjectMetadata({})).toEqual({})
    expect(readDesktopProjectMetadata({ 'local-projects': {} }).localProjects).toEqual([])
  })
  it('rejects malformed projects and returns independent metadata copies', () => {
    const state = normalizeProjectMetadata({ localProjects: [null, { id: '' }, { id: 'a', rootPaths: ['x', 'x', null] }, { id: 'a' }], threadProjectAssignments: { invalid: 'missing' } })
    expect(state.localProjects).toEqual([{ id: 'a', name: 'a', rootPaths: ['x'] }])
    expect(state.threadProjectAssignments).toEqual({})
  })
  it('renames only the selected project and preserves unrelated desktop state', () => {
    const before = desktop()
    const next = applyLocalProjectMutation(before, { type: 'rename', projectId: 'alpha', name: '新名称' })
    expect((next['local-projects'] as typeof before['local-projects']).alpha).toMatchObject({ name: '新名称', createdAt: 10, other: 'preserve' })
    expect(next.unrelated).toEqual(before.unrelated)
    expect(before['local-projects'].alpha.name).toBe('中文项目')
    expect(() => applyLocalProjectMutation(before, { type: 'rename', projectId: 'alpha', name: '' })).toThrow()
  })
  it('removes project membership without deleting conversations or files', () => {
    const next = applyLocalProjectMutation(desktop(), { type: 'remove', projectId: 'alpha' })
    expect(next['projectless-thread-ids']).toEqual(['free', 'one'])
    expect(next['thread-project-assignments']).toEqual({ two: { projectKind: 'chatgpt', projectId: 'g-p-cloud' } })
    expect(next['project-order']).toEqual(['beta', 'old-path', 'g-p-cloud'])
    expect((next['local-projects'] as Record<string, unknown>).alpha).toBeUndefined()
    expect(next.unrelated).toEqual({ keep: true })
  })
  it('preserves concurrently added projects and cloud ordering when reordering', () => {
    const before = desktop()
    const next = applyLocalProjectMutation(before, { type: 'reorder', projectIds: ['alpha'] })
    expect(next['project-order']).toEqual(['alpha', 'beta', 'old-path', 'g-p-cloud'])
    expect(() => applyLocalProjectMutation(before, { type: 'remove', projectId: 'gone' })).toThrow()
  })
  it('moves an ordinary chat, preserving history paths and unrelated state', () => {
    const before = { ...desktop(), 'thread-workspace-root-hints': { free: 'C:\\Old\\Folder' },
      'sidebar-project-thread-orders': { alpha: { threadIds: ['one', 'free'], custom: true }, beta: { threadIds: ['other'] } } }
    const next = applyThreadProjectMutation(before, { threadId: 'free', projectId: 'beta' })
    expect(next['thread-project-assignments']).toMatchObject({ free: { projectKind: 'local', projectId: 'beta' } })
    expect(next['projectless-thread-ids']).toEqual([])
    expect(next['sidebar-project-thread-orders']).toEqual({ alpha: { threadIds: ['one'], custom: true }, beta: { threadIds: ['free', 'other'] } })
    expect(next['thread-workspace-root-hints']).toEqual(before['thread-workspace-root-hints'])
    expect(before['projectless-thread-ids']).toEqual(['free'])
    expect(next.unrelated).toEqual(before.unrelated)
  })
  it('moves a task back to ordinary chats without cwd-based reassignment', () => {
    const next = applyThreadProjectMutation(desktop(), { threadId: 'one', projectId: null })
    expect(next['thread-project-assignments']).not.toHaveProperty('one')
    expect(next['projectless-thread-ids']).toEqual(['free', 'one'])
    expect(next['sidebar-project-thread-orders']).toEqual({ alpha: { threadIds: [] } })
    expect(next['thread-project-membership-host-ids']).toEqual({ one: 'local' })
  })
  it('makes repeated assignment idempotent without duplicate ordered tasks', () => {
    const once = applyThreadProjectMutation(desktop(), { threadId: 'one', projectId: 'beta' })
    expect(applyThreadProjectMutation(once, { threadId: 'one', projectId: 'beta' })).toEqual(once)
    const free = applyThreadProjectMutation(once, { threadId: 'one', projectId: null })
    expect(applyThreadProjectMutation(free, { threadId: 'one', projectId: null })).toEqual(free)
  })
  it('rejects deleted or cloud projects and malformed IDs', () => {
    for (const projectId of ['gone', 'g-p-cloud']) expect(() => applyThreadProjectMutation(desktop(), { threadId: 'one', projectId })).toThrow()
    expect(() => applyThreadProjectMutation({}, { threadId: 'one', projectId: null })).toThrow()
    for (const threadId of ['', '__proto__', 'constructor', ' padded ']) expect(() => applyThreadProjectMutation(desktop(), { threadId, projectId: null })).toThrow()
    expect(() => applyThreadProjectMutation(desktop(), { threadId: 'two', projectId: 'alpha' })).toThrow('ChatGPT')
  })
})
