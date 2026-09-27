import { describe, expect, it } from 'vitest'
import { normalizeThreadGroupsV2 } from './v2'
import type { ThreadListResponse } from '../appServerDtos'

function page(rows: Array<{ id: string; updatedAt: number; cwd?: string; name?: string }>): ThreadListResponse {
  return { data: rows.map(row => ({ createdAt: 1, cwd: '/projects/a', name: 'Same title', preview: 'hello', ...row })), nextCursor: null } as ThreadListResponse
}

describe('initial thread list duplicate snapshots', () => {
  it('renders seven snapshots of one ID only once, keeping the newest data', () => {
    const groups = normalizeThreadGroupsV2(page([
      { id: 'one', updatedAt: 8, name: 'Newest' },
      ...Array.from({ length: 6 }, (_, i) => ({ id: 'one', updatedAt: i + 1 })),
    ]))
    expect(groups.flatMap(group => group.threads)).toMatchObject([{ id: 'one', title: 'Newest' }])
  })
  it('keeps genuinely different threads with identical names', () => {
    const threads = normalizeThreadGroupsV2(page([{ id: 'one', updatedAt: 1 }, { id: 'two', updatedAt: 2 }])).flatMap(group => group.threads)
    expect(threads.map(thread => thread.id)).toEqual(['two', 'one'])
  })
  it('deduplicates before grouping when a newer snapshot changes the project', () => {
    const groups = normalizeThreadGroupsV2(page([{ id: 'one', updatedAt: 1 }, { id: 'one', updatedAt: 2, cwd: '/projects/b' }]))
    expect(groups).toHaveLength(1)
    expect(groups[0].threads[0].cwd).toBe('/projects/b')
  })
  it('keeps the first snapshot on timestamp ties and does not mutate the API response', () => {
    const input = page([{ id: 'one', updatedAt: 1, name: 'First' }, { id: 'one', updatedAt: 1, name: 'Second' }])
    expect(normalizeThreadGroupsV2(input)[0].threads[0].title).toBe('First')
    expect(input.data).toHaveLength(2)
  })
})
