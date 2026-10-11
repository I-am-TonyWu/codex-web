/** API endpoints can receive an HTML gateway/login page instead of JSON. */
export async function readServiceJson(response: Response, fallback: string): Promise<Record<string, any>> {
  let payload: Record<string, any> | null = null
  try {
    const parsed: unknown = JSON.parse(await response.text())
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed as Record<string, any>
  } catch { /* report the transport problem, never display raw gateway HTML */ }
  if (!payload) {
    if (response.status === 401 || response.status === 403 || response.redirected) throw new Error('登录状态已失效，请刷新网页重新验证。')
    throw new Error(response.status >= 500
      ? `网页服务暂时无法连接（HTTP ${response.status}），请稍后重试。现有账户未被移除。`
      : '网页服务返回了无效响应，请刷新页面后重试。')
  }
  if (!response.ok || payload.ok === false || payload.error) {
    throw new Error(typeof payload.message === 'string' && payload.message.trim() ? payload.message : typeof payload.error === 'string' ? payload.error : fallback)
  }
  return payload
}
