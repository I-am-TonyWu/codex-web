import { describe, expect, it } from 'vitest'
import { isRemoteAccountMutation, remoteAccountReadParams } from './remoteAccountPolicy'

describe('remote account boundary', () => {
  it.each(['account/login/start', 'account/login/cancel', 'account/logout', 'account/chatgptAuthTokens/refresh', 'account/future/write', 'loginChatGpt', 'logOutChatGpt', 'auth/logout'])('blocks %s', method => {
    expect(isRemoteAccountMutation(method)).toBe(true)
  })
  it.each(['account/read', 'account/rateLimits/read', 'model/list', 'thread/read', 'mcpServer/oauth/login'])('keeps unrelated and read-only methods available: %s', method => {
    expect(isRemoteAccountMutation(method)).toBe(false)
  })
  it('disallows a forged request to refresh native login credentials', () => {
    expect(remoteAccountReadParams('account/read', { refreshToken:true })).toEqual({refreshToken:false})
    expect(remoteAccountReadParams('model/list', {limit:10})).toEqual({limit:10})
  })
})
