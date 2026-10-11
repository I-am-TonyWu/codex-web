import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getSkillPresentation, needsChineseTranslation, splitSkillTextForTranslation, waitForSkillTranslations } from './skillPresentation'

let home: string
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'codex-skill-chinese-')); vi.stubEnv('CODEX_HOME', home) })
afterEach(async () => { await waitForSkillTranslations(); vi.unstubAllEnvs(); await rm(home, { recursive: true, force: true }) })

describe('Chinese skill presentation', () => {
  it('splits long explanations without omitting text or dividing fenced code', () => {
    const code = '```sh\nreport --check\n\nreport --summary\n```'
    const source = { description: 'Inspect reports.', content: 'A complete explanation.\n'.repeat(600) + code + '\nThe final sentence.' }
    const chunks = splitSkillTextForTranslation(source)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.map(chunk => chunk.content).join('')).toBe(source.content)
    expect(chunks.filter(chunk => chunk.content.includes(code))).toHaveLength(1)
    expect(chunks[0].description).toBe(source.description)
    expect(chunks.slice(1).every(chunk => chunk.description === '')).toBe(true)
  })

  it('recognizes English prose without treating code and technical names as an English description', () => {
    expect(needsChineseTranslation('Use this skill to create diagrams.')).toBe(true)
    expect(needsChineseTranslation('Export slides.')).toBe(true)
    expect(needsChineseTranslation('用 Microsoft MarkItDown 提取文字。')).toBe(false)
    expect(needsChineseTranslation('用 Fontsource 配置网页字体。\n```sh\nrun this example command with arguments\n```')).toBe(false)
  })

  it('translates an unknown newly installed skill, reuses the saved result and refreshes changed content', async () => {
    const source = { description: 'Use this new skill to inspect reports.', content: '# Reports\nKeep all information in the final document.\n```sh\nreport --check\n```' }
    const translated = { description: '使用新技能检查报告。', content: '# 报告\n保留最终文档中的全部信息。\n```sh\nreport --check\n```' }
    const translate = vi.fn().mockResolvedValue(translated)
    expect((await getSkillPresentation(source, translate)).translationStatus).toBe('pending')
    await waitForSkillTranslations()
    expect(await getSkillPresentation(source, translate)).toEqual({ ...translated, translationStatus: 'ready' })
    expect(translate).toHaveBeenCalledTimes(1)
    expect((await getSkillPresentation({ ...source, description: source.description + ' Include revised tables.' }, translate)).translationStatus).toBe('pending')
    await waitForSkillTranslations()
    expect(translate).toHaveBeenCalledTimes(2)
  })

  it('does not call a model for Chinese explanations', async () => {
    const source = { description: '检查报告并保留完整数据。', content: '# 报告\n保持原始链接。' }
    const translate = vi.fn()
    expect(await getSkillPresentation(source, translate)).toEqual({ ...source, translationStatus: 'ready' })
    expect(translate).not.toHaveBeenCalled()
  })

  it('keeps failures visible in Chinese and prevents repeated calls during the retry window', async () => {
    const source = { description: 'Translate this failing skill description now.', content: '' }
    const translate = vi.fn().mockRejectedValue(new Error('offline'))
    await getSkillPresentation(source, translate)
    await waitForSkillTranslations()
    const result = await getSkillPresentation(source, translate)
    expect(result.translationStatus).toBe('error')
    expect(result.description).toContain('中文说明')
    expect(translate).toHaveBeenCalledTimes(1)
  })

  it('rejects translations that alter executable code', async () => {
    const source = { description: 'Use this skill to inspect reports.', content: '```sh\nreport --check\n```' }
    await getSkillPresentation(source, vi.fn().mockResolvedValue({ description: '检查报告。', content: '```sh\nreport --delete\n```' }))
    await waitForSkillTranslations()
    expect((await getSkillPresentation(source)).translationStatus).toBe('error')
  })
})
