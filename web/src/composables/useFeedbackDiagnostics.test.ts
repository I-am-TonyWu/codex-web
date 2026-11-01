import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildFeedbackUrl,
  feedbackBaseUrl,
  installFeedbackDiagnostics,
  recordFeedbackDiagnostic,
  useFeedbackDiagnostics,
} from './useFeedbackDiagnostics'

beforeEach(() => {
  vi.stubGlobal('navigator', {
    userAgent: 'TestAgent/1.0',
    onLine: true,
    language: 'en-US',
    platform: 'TestOS',
  })
  vi.stubGlobal('window', {
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 2,
    location: {
      href: 'http://127.0.0.1:4173/#/',
      pathname: '/',
      search: '',
      hash: '#/',
    },
    addEventListener: vi.fn(),
    localStorage: {
      length: 2,
      key: vi.fn((index: number) => ['codex-web-local.sidebar-chat-sort-mode.v1', 'codex-token'][index] ?? null),
      getItem: vi.fn((key: string) => ({
        'codex-web-local.sidebar-chat-sort-mode.v1': 'updated',
        'codex-token': 'super-secret-token',
      })[key] ?? null),
    },
    sessionStorage: {
      length: 1,
      key: vi.fn((index: number) => ['codex-web-local.temp'][index] ?? null),
      getItem: vi.fn((key: string) => key === 'codex-web-local.temp' ? 'open-folder-modal' : null),
    },
  })
  vi.stubGlobal('document', {
    body: {
      innerText: 'Start new thread\\nVisible failure banner\\nSend feedback',
    },
  })
  useFeedbackDiagnostics().diagnostics.value = []
})

describe('feedback diagnostics', () => {
  it('keeps feedback hidden until a diagnostic is recorded', () => {
    const state = useFeedbackDiagnostics()

    expect(state.hasFeedbackDiagnostics.value).toBe(false)

    state.recordVisibleFailure('Failed to load folders')

    expect(state.hasFeedbackDiagnostics.value).toBe(true)
  })

  it('opens an issue draft in the user repository with minimal diagnostics', () => {
    recordFeedbackDiagnostic({
      kind: 'api-response',
      message: 'Request failed with HTTP 500',
      url: '/codex-api/rpc',
      method: 'POST',
      status: 500,
      statusText: 'Internal Server Error',
      atIso: '2026-05-12T03:00:00.000Z',
    })

    const mailto = buildFeedbackUrl()
    const parsed = new URL(mailto)
    const body = parsed.searchParams.get('body') ?? ''

    expect(parsed.origin + parsed.pathname).toBe('https://github.com/I-am-TonyWu/codex-web/issues/new')
    expect(mailto).not.toContain('+')
    expect(parsed.searchParams.get('title')).toContain('codex-web')
    expect(body).not.toContain('URL: http://127.0.0.1:4173/#/')
    expect(body).toContain('User agent: TestAgent/1.0')
    expect(body).toContain('Viewport: 390x844 @2x')
    expect(body).not.toContain('Browser/app state')
    expect(body).not.toContain('Hash: #/')
    expect(body).not.toContain('Online: true')
    expect(body).not.toContain('codex-web-local.sidebar-chat-sort-mode.v1=updated')
    expect(body).not.toContain('codex-token=[omitted sensitive value, 18 chars]')
    expect(mailto).not.toContain('super-secret-token')
    expect(body).not.toContain('codex-web-local.temp=open-folder-modal')
    expect(body).toContain('POST | 500 Internal Server Error')
    expect(body).not.toContain('Visible page text')
    expect(body).not.toContain('Visible failure banner')
  })

  it('exposes the issue composer for static anchors', () => {
    expect(feedbackBaseUrl()).toBe('https://github.com/I-am-TonyWu/codex-web/issues/new')
  })

  it('dedupes identical newest diagnostics', () => {
    recordFeedbackDiagnostic({
      kind: 'visible-error',
      message: 'Failed to load folders',
      url: 'http://127.0.0.1:4173/#/',
      atIso: '2026-05-12T03:00:00.000Z',
    })
    recordFeedbackDiagnostic({
      kind: 'visible-error',
      message: 'Failed to load folders',
      url: 'http://127.0.0.1:4173/#/',
      atIso: '2026-05-12T03:00:01.000Z',
    })

    expect(useFeedbackDiagnostics().diagnostics.value).toHaveLength(1)
  })

  it('does not send exception text in the title or body', () => {
    recordFeedbackDiagnostic({
      kind: 'window-error',
      message: 'Top level failure\n    at stack frame\n    at another frame',
      url: 'http://127.0.0.1:4173/#/',
      atIso: '2026-05-12T03:00:00.000Z',
    })

    const url = new URL(buildFeedbackUrl())
    expect(url.searchParams.get('title')).toContain('codex-web')
    expect(decodeURIComponent(url.href)).not.toContain('Top level failure')
  })

  it('does not throw during install when fetch is unavailable', () => {
    expect(() => installFeedbackDiagnostics()).not.toThrow()

    expect(useFeedbackDiagnostics().diagnostics.value[0]?.message).toContain('window.fetch is unavailable')
  })

  it('does not throw during install when fetch cannot be patched', () => {
    Object.defineProperty(window, 'fetch', {
      value: vi.fn(),
      writable: false,
      configurable: true,
    })

    expect(() => installFeedbackDiagnostics()).not.toThrow()

    expect(useFeedbackDiagnostics().diagnostics.value[0]?.message).toContain('could not monitor fetch')
  })
})
