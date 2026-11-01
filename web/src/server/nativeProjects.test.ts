import { describe, expect, it, vi } from 'vitest'
import { listNativeProjects, resolveNativeProject, saveNativeThreadProject } from './nativeProjects'

describe('native project membership', () => {
  it('resolves a migrated project from later pages without importing a duplicate', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [{ id: 'other' }], nextCursor: 'next' })
      .mockResolvedValueOnce({ data: [{ id: 'native', metadata: { 'codex.localProjectId': 'legacy' } }], nextCursor: null })
    expect(await resolveNativeProject({ rpc }, { id: 'legacy', name: '项目', rootPaths: [] })).toBe('native')
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['project/list', 'project/list'])
  })
  it('imports a web-created project with a stable idempotency key', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [], nextCursor: null }).mockResolvedValueOnce({ project: { id: 'native' } })
    expect(await resolveNativeProject({ rpc }, { id: 'legacy', name: '项目', rootPaths: ['C:/Work'] })).toBe('native')
    expect(rpc).toHaveBeenLastCalledWith('project/import', { idempotencyKey: 'legacy', name: '项目', roots: [{ path: 'C:/Work' }], metadata: { 'codex.localProjectId': 'legacy' } })
  })
  it('matches an existing desktop project with different IDs and Windows path spelling', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'native', roots: [{ path: 'c:\\WORK\\review\\' }] }], nextCursor: null })
    expect(await resolveNativeProject({ rpc }, { id: 'legacy', name: '项目', rootPaths: ['C:/Work/review'] })).toBe('native')
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it('confirms the durable native field for moves and explicit projectless chats', async () => {
    let projectId: string | null = null
    const rpc = vi.fn(async (method: string, params: unknown) => {
      if (method === 'thread/metadata/update') { projectId = (params as { projectId: string }).projectId || null; return {} }
      return { thread: { projectId } }
    })
    await saveNativeThreadProject({ rpc }, 'chat', 'project')
    expect(projectId).toBe('project')
    await saveNativeThreadProject({ rpc }, 'chat', null)
    expect(rpc).toHaveBeenCalledWith('thread/metadata/update', { threadId: 'chat', projectId: '' })
    expect(projectId).toBeNull()
  })
  it('does not report success when the native readback disagrees or the write fails', async () => {
    await expect(saveNativeThreadProject({ rpc: vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({ thread: { projectId: null } }) }, 'chat', 'project')).rejects.toThrow('未确认')
    const rpc = vi.fn().mockRejectedValue(new Error('database unavailable'))
    await expect(saveNativeThreadProject({ rpc }, 'chat', null)).rejects.toThrow('database unavailable')
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it('rejects repeating project pagination cursors', async () => {
    await expect(listNativeProjects({ rpc: vi.fn().mockResolvedValue({ data: [], nextCursor: 'same' }) })).rejects.toThrow('完整读取')
  })
})
