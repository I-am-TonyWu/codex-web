import { describe, expect, it } from 'vitest'
import { applyLocalProjectMutation, normalizeProjectMetadata, readDesktopProjectMetadata } from './workspaceProjects'

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
})
