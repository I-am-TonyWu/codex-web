import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAppServerArgs, buildWebTurnPermissionOverrides } from './appServerRuntimeConfig'

afterEach(() => vi.unstubAllEnvs())

describe('app-server runtime config', () => {
  it('uses the same full-access/no-approval defaults for new and resumed web turns', () => {
    expect(buildAppServerArgs()).toContain('approval_policy="never"')
    expect(buildAppServerArgs()).toContain('sandbox_mode="danger-full-access"')
    expect(buildWebTurnPermissionOverrides()).toEqual({ approvalPolicy: 'never', approvalsReviewer: 'user', permissions: null, sandboxPolicy: { type: 'dangerFullAccess' } })
  })
  it.each(['read-only', 'workspace-write'])('preserves the explicit %s service policy', sandbox => {
    vi.stubEnv('CODEXUI_SANDBOX_MODE', sandbox); vi.stubEnv('CODEXUI_APPROVAL_POLICY', 'on-request')
    const result = buildWebTurnPermissionOverrides('C:/project')
    expect(result.approvalPolicy).toBe('on-request')
    expect(result.sandboxPolicy).toMatchObject({ type: sandbox === 'read-only' ? 'readOnly' : 'workspaceWrite' })
    if (sandbox === 'workspace-write') expect(result.sandboxPolicy).toMatchObject({ writableRoots: ['C:/project'], networkAccess: false })
  })
  it('gracefully unloads an unsubscribed idle web writer immediately', () => {
    const args = buildAppServerArgs()
    const index = args.indexOf('thread_unload_delay_secs=0')
    expect(index).toBeGreaterThan(0)
    expect(args[index - 1]).toBe('-c')
  })
  it('enables Codex memories by default for spawned app-server processes', () => {
    const args = buildAppServerArgs()
    const featureIndex = args.indexOf('features.memories=true')

    expect(featureIndex).toBeGreaterThan(0)
    expect(args[featureIndex - 1]).toBe('-c')
  })

  it('can disable Codex memories through runtime configuration', () => {
    process.env.CODEXUI_MEMORIES = 'false'
    try {
      const args = buildAppServerArgs()
      const featureIndex = args.indexOf('features.memories=false')

      expect(featureIndex).toBeGreaterThan(0)
      expect(args[featureIndex - 1]).toBe('-c')
      expect(args).not.toContain('features.memories=true')
    } finally {
      delete process.env.CODEXUI_MEMORIES
    }
  })
})
