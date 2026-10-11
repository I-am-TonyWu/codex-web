import type { UiMessage } from '../types/codex'

export function isProcessMessage(message: UiMessage): boolean {
  return message.messageType === 'commandExecution' || message.messageType === 'imageView'
}

// Keep narration and turn boundaries intact. A stable first-item anchor keeps
// an opened group open while new operations arrive.
export function groupProcessMessages(messages: UiMessage[]): Map<string, UiMessage[]> {
  const groups = new Map<string, UiMessage[]>()
  let block: UiMessage[] = []
  const flush = () => {
    if (block.length) groups.set(block[0].id, block)
    block = []
  }
  for (const message of messages) {
    if (!isProcessMessage(message)) { flush(); continue }
    if (block.length && block[0].turnId !== message.turnId) flush()
    block.push(message)
  }
  flush()
  return groups
}

export function commandAction(command: string): string {
  // Only describe recognizable operations. Never expose a script or claim an
  // outcome based on arbitrary output text.
  if (/\b(?:pytest|vitest|jest|vue-tsc|tsc|eslint|ruff)\b|(?:npm|pnpm)\s+(?:run\s+)?(?:test|lint|typecheck)\b/i.test(command)) return '运行检查'
  if (/\b(?:apply_patch|Set-Content|Add-Content|Out-File|WriteAllText|writeFile|New-Item)\b/i.test(command)) return '编辑或创建文件'
  if (/\b(?:Get-Content|ReadAllText|readFile|cat|head|tail)\b/i.test(command)) return '读取文件'
  if (/\b(?:rg|grep|findstr|Get-ChildItem|ls)\b/i.test(command)) return '查找文件或内容'
  if (/\b(?:vite build|tsup|build\.ps1)\b|(?:npm|pnpm)\s+run\s+build/i.test(command)) return '构建项目'
  if (/\bgit\s+(?:status|diff|log|show|rev-parse)\b/i.test(command)) return '检查代码变更'
  return '执行工具操作'
}

export function processSummary(messages: UiMessage[]): string {
  const counts = new Map<string, number>()
  for (const message of messages) {
    if (message.messageType === 'imageView') {
      counts.set('查看图片', (counts.get('查看图片') ?? 0) + (message.images?.length ?? 0))
    } else if (message.commandExecution) {
      const label = commandAction(message.commandExecution.command)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
  }
  return [...counts].map(([label, count]) => label === '查看图片' ? `查看 ${count} 张图片` : `${label}${count > 1 ? ` ${count} 次` : ''}`).join(' · ') || '工具操作'
}

export function processStatus(messages: UiMessage[]): { label: string; tone: string } {
  const commands = messages.flatMap(message => message.commandExecution ? [message.commandExecution] : [])
  if (commands.some(command => command.status === 'inProgress')) return { label: '进行中', tone: 'running' }
  const failures = commands.filter(command => command.status === 'failed' || (command.status === 'completed' && command.exitCode !== null && command.exitCode !== 0)).length
  if (failures) return { label: `${failures} 项工具操作未成功`, tone: 'error' }
  if (commands.some(command => command.status === 'interrupted')) return { label: '已停止', tone: 'muted' }
  if (commands.some(command => command.status === 'declined')) return { label: '已拒绝', tone: 'muted' }
  return { label: '', tone: 'muted' }
}

export type TaskPresentation = { kind: string; label: string; detail: string }
export function taskPresentation(input: {
  messages: UiMessage[]; running: boolean; sending?: boolean; loading?: boolean;
  pending: boolean; error?: string; activity?: string; transferring?: boolean;
  turnStatus?: UiMessage['turnStatus'];
  connectionUncertain?: boolean;
}): TaskPresentation {
  if (input.loading) return { kind: 'loading', label: '正在同步', detail: '读取对话与任务状态' }
  if (input.connectionUncertain) return { kind: 'unknown', label: '状态待确认', detail: '正在连接后台，暂时无法确认任务状态' }
  if (input.transferring) return { kind: 'unknown', label: '正在确认状态', detail: '会话交接中' }
  if (input.pending) return { kind: 'waiting', label: '等待你处理', detail: '请查看下方的审批或问题' }
  if (input.sending) return { kind: 'running', label: '正在提交', detail: '等待后台确认任务开始' }
  if (input.running) return { kind: 'running', label: '任务运行中', detail: '' }
  if (input.error) return { kind: 'failed', label: '任务出错', detail: '' }
  const latest = input.messages.at(-1)
  const status = input.turnStatus ?? latest?.turnStatus
  if (status === 'failed' || latest?.messageType === 'turnError') return { kind: 'failed', label: '任务出错', detail: '' }
  if (status === 'interrupted') return { kind: 'stopped', label: '任务已停止', detail: '可以继续发送消息' }
  if (status === 'completed' || latest?.messageType === 'worked') return { kind: 'completed', label: '任务已完成', detail: '' }
  if (input.activity === 'idle') return { kind: 'idle', label: '当前无运行任务', detail: '可以继续发送消息' }
  return { kind: 'unknown', label: '正在确认状态', detail: '尚未确认最新任务状态' }
}
