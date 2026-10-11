import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { collectInstalledSkillsMap, extractSkillDescriptionFromMarkdown, isPersonalSkillPath } from './skillsRoutes'

let home: string
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'codex-personal-skills-'))
  vi.stubEnv('CODEX_HOME', home)
})
afterEach(async () => { vi.unstubAllEnvs(); await rm(home, { recursive: true, force: true }) })

describe('personal skill directory', () => {
  it('reads folded and literal descriptions instead of displaying YAML block markers', () => {
    expect(extractSkillDescriptionFromMarkdown('---\nname: folded\ndescription: >\n  First sentence.\n  Second sentence.\nlicense: MIT\n---\n# Body')).toBe('First sentence. Second sentence.')
    expect(extractSkillDescriptionFromMarkdown('\uFEFF---\r\nname: literal\r\ndescription: |-\r\n  First line.\r\n  Second line.\r\n---\r\n')).toBe('First line.\nSecond line.')
    expect(extractSkillDescriptionFromMarkdown('---\nname: quoted\ndescription: "Use \\"quoted\\" text."\n---\n')).toBe('Use "quoted" text.')
  })
  it('includes personal installs across Windows path separators and keeps system and plugin entries out', () => {
    const skill = join(home, 'skills', 'my-skill', 'SKILL.md')
    expect(isPersonalSkillPath(skill, 'user')).toBe(true)
    expect(isPersonalSkillPath(skill.replace(/\\/g, '/'), 'user')).toBe(true)
    for (const path of [join(home, 'skills', '.system', 'imagegen', 'SKILL.md'), join(home, 'plugins', 'cache', 'foo', 'skills', 'foo', 'SKILL.md'), join(home, 'skills-other', 'foo', 'SKILL.md'), join(home, 'skills', '..', 'other', 'SKILL.md')]) {
      expect(isPersonalSkillPath(path, 'user')).toBe(false)
    }
    expect(isPersonalSkillPath(skill, 'system')).toBe(false)
    expect(isPersonalSkillPath(skill, 'admin')).toBe(false)
    expect(isPersonalSkillPath('')).toBe(false)
  })

  it('uses Codex enablement for disk installs and includes disabled personal skills', async () => {
    const path = join(home, 'skills', 'local-install', 'SKILL.md')
    await mkdir(join(home, 'skills', 'local-install'), { recursive: true })
    await writeFile(path, '---\nname: friendly-name\ndescription: personal\n---\n')
    const map = await collectInstalledSkillsMap({ rpc: vi.fn().mockResolvedValue({ data: [{ skills: [
      { name: 'friendly-name', path, scope: 'user', enabled: false },
      { name: 'plugin-skill', path: join(home, 'plugins', 'cache', 'foo', 'skills', 'foo', 'SKILL.md'), scope: 'user', enabled: true },
      { name: 'imagegen', path: join(home, 'skills', '.system', 'imagegen', 'SKILL.md'), scope: 'system', enabled: true },
    ] }] }) })
    expect([...map.values()]).toEqual([{ name: 'friendly-name', path, enabled: false }])
  })

  it('reports unavailable Codex state instead of falsely showing disk installs as enabled', async () => {
    await expect(collectInstalledSkillsMap({ rpc: vi.fn().mockRejectedValue(new Error('offline')) })).rejects.toThrow('offline')
  })
})
