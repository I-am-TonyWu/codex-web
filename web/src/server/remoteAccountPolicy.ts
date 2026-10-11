// The browser is a remote view of the host's Codex session, never an auth manager.
export const REMOTE_ACCOUNT_DISABLED_MESSAGE = '网页不管理 Codex 账户，请在 Windows 主机的 Codex 客户端中登录或切换账户。'

export function isRemoteAccountMutation(method: string): boolean {
  if (method.startsWith('account/')) {
    return method !== 'account/read' && method !== 'account/rateLimits/read'
  }
  return method.startsWith('auth/') || ['loginChatGpt', 'logOutChatGpt', 'loginApiKey', 'cancelLoginChatGpt'].includes(method)
}

export function remoteAccountReadParams(method: string, params: unknown): unknown {
  // Even a forged refreshToken:true from a stale web page must stay read-only.
  return method === 'account/read' ? { refreshToken: false } : params
}
