import { describe, expect, it } from 'vitest'
import type { UiMessage } from '../types/codex'
import { commandAction, groupProcessMessages, processStatus, processSummary, taskPresentation } from './conversationPresentation'

const command = (id: string, status: 'completed' | 'failed' | 'inProgress' = 'completed', turnId = 'turn-1'): UiMessage => ({
  id, turnId, role: 'system', text: 'private command', messageType: 'commandExecution',
  commandExecution: { command: 'Get-Content -LiteralPath C:\\private\\report.md', status, cwd: null, aggregatedOutput: 'private output', exitCode: status === 'failed' ? 1 : status === 'completed' ? 0 : null },
})
const image: UiMessage = { id: 'image', turnId: 'turn-1', role: 'assistant', text: '', messageType: 'imageView', images: ['/image-1', '/image-2'] }
const narration: UiMessage = { id: 'narration', role: 'assistant', text: '正在核对内容。', turnId: 'turn-1', messageType: 'agentMessage' }

describe('conversation presentation', () => {
  it('groups images with commands without crossing narration or a turn boundary', () => {
    const groups = groupProcessMessages([command('1'), image, narration, command('2'), command('3', 'completed', 'turn-2')])
    expect([...groups.keys()]).toEqual(['1', '2', '3'])
    expect(groups.get('1')?.map(message => message.id)).toEqual(['1', 'image'])
  })
  it('keeps the anchor stable as the running group grows', () => {
    expect([...groupProcessMessages([command('1')]).keys()]).toEqual([...groupProcessMessages([command('1'), image]).keys()])
  })
  it('summarizes operations without exposing commands, paths or outputs', () => {
    expect(processSummary([command('1'), command('2'), image])).toBe('读取文件 2 次 · 查看 2 张图片')
    expect(commandAction('unknown-script --private-value')).toBe('执行工具操作')
  })
  it('retains a failure even when the last command succeeds', () => {
    expect(processStatus([command('1', 'failed'), command('2')])).toEqual({ label: '1 项工具操作未成功', tone: 'error' })
    expect(processStatus([command('1', 'failed'), command('2', 'inProgress')]).tone).toBe('running')
    expect(processStatus([{ ...command('1'), commandExecution: { ...command('1').commandExecution!, exitCode: null } }]).tone).toBe('muted')
  })
  it('uses task state rather than the success of an individual tool', () => {
    expect(taskPresentation({ messages: [command('1')], running: true, pending: false }).kind).toBe('running')
    expect(taskPresentation({ messages: [command('1')], running: false, pending: false }).kind).toBe('unknown')
    expect(taskPresentation({ messages: [command('1', 'inProgress')], running: false, pending: false, turnStatus: 'completed' }).kind).toBe('completed')
  })
  it.each(['completed', 'failed', 'interrupted'] as const)('restores the terminal state %s after reload', turnStatus => {
    const expected = { completed: 'completed', failed: 'failed', interrupted: 'stopped' }
    expect(taskPresentation({ messages: [{ ...narration, turnStatus }], running: false, pending: false }).kind).toBe(expected[turnStatus])
  })
  it('prioritizes new work and user requests over old completed history', () => {
    const input = { messages: [{ ...narration, turnStatus: 'completed' as const }], running: true, pending: false }
    expect(taskPresentation(input).kind).toBe('running')
    expect(taskPresentation({ ...input, pending: true }).kind).toBe('waiting')
    expect(taskPresentation({ ...input, running: false, error: 'failure' }).kind).toBe('failed')
    expect(taskPresentation({ ...input, sending: true }).label).toBe('正在提交')
  })
  it('does not hide user attachments or image generation deliverables', () => {
    expect(groupProcessMessages([{ ...image, role: 'user', messageType: 'userMessage' }, { ...image, messageType: 'imageGeneration' }]).size).toBe(0)
  })
  it('does not present a stale running state as confirmed after connection loss', () => {
    expect(taskPresentation({ messages: [narration], running: true, pending: false, connectionUncertain: true }).kind).toBe('unknown')
  })
})
