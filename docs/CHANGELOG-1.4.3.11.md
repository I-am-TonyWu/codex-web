# 1.4.3.11 — 网页只连接主机 / Host-owned authentication

2026-10-10。本版原为本地构建，现已合入 [1.4.4 预览版](releases/1.4.4.md)，没有单独发行附件。

## 中文

远程网页的定位是连接已经登录的 Windows Codex，而非管理该客户端的账户。1.4.3.10 仍有登录、账户切换、移除及自动导入凭据的代码；即使额度重新加载已修复，这些能力也超出了网页的用途。

- 删除网页设置的整个账户区域、登录弹窗、账户轮询及自动导入行为。
- 服务端关闭 `/codex-api/accounts` 及子路径，旧页面请求得到 HTTP 410 JSON。通用 RPC 也拒绝 Codex 登录、取消、退出等操作；`account/read` 强制只读，忽略伪造的 `refreshToken: true`。
- 网页启动的 Codex 后台使用 `cli_auth_credentials_store="ephemeral"`。仅在该独立后台的内存中使用主机当前访问令牌，不使用主机刷新令牌、不改写 `auth.json`，不发起新的 OAuth 授权或退出主机客户端。
- 主机登录过期时，网页提示在 Windows Codex 中处理；本地历史和设置仍可读取。凭据刷新由主机 Codex 负责，网页只重新读取已更新的访问令牌。
- 将“需要 Command+Enter 才发送”改为“需要 Ctrl+Enter 才发送”，实际键盘逻辑同步修改。开启后 Enter、Shift+Enter、Command+Enter 不发送；Ctrl+Enter 发送。关闭后 Enter 发送、Shift+Enter 换行。偏好保留在当前浏览器。
- 删除 Telegram 选项，停止自动启动 Telegram 桥接服务，关闭其旧接口。
- 将 Codex 额度卡片放在设置顶部。暂时读不到额度时显示占位提示，改善深色主题标题的可读性。
- 提供方选择只保存到网页专用 `webui-custom-providers.json`，不修改主机登录和 `config.toml`。第三方提供方明确不要求 OpenAI 登录；OpenRouter 切换合并为单次设置，保留已保存的密钥。主机登录变化不再自动改写网页选择。
- 提供方切换前检查活动任务与待确认请求；忙碌时返回可读提示，不停止任务。切换失败恢复实际选项。切回 Codex 时从主机重新读取凭据，恢复模型和额度查询。

使用：刷新自己的远程网页后打开设置；登录、退出和更换 Codex 账户请在 Windows 主机的 Codex 客户端操作。网页密码和 Cloudflare Access 是远程访问保护，保留原设置；它们与被删除的 Codex 账户管理不同。

验证：146 项相关单元/服务集成测试、51 项托盘测试；42 个界面场景，覆盖 375/768/1440 像素、明暗主题、快捷键及偏好持久化、提供方往返切换及失败恢复。真实 Windows Codex 临时进程已验证内存凭据不改写登录文件。安装后服务 Healthy；真实页面 375px 浅色、1440px 深色验收通过，账户/Telegram 已移除、额度置顶、版本显示正确。模型与额度读取正常；旧账户接口及伪造账户写入请求被拒绝。六项主机配置/凭据、注册表 Token、自启路径均未变化，桌面 Codex 进程保留，Access 可读取两个邮箱。未发送模型消息。手机外网连续实际使用及 Windows 重启未现场验收。

## English

The web UI connects to the Codex session already signed in on Windows; it no longer manages native accounts.

- Removed account settings, login dialog, polling and automatic credential import. Removed account REST routes return HTTP 410 JSON. Generic RPC rejects Codex sign-in/sign-out operations and forces account reads to `refreshToken: false`.
- The web-owned Codex process uses ephemeral credential storage and receives only the host's current access token in memory. It never uses the host refresh token, writes `auth.json`, starts OAuth, or signs out the native client. Token renewal remains the native client's responsibility.
- Expired native credentials produce desktop sign-in instructions while preserving local history/settings access.
- Replaced Command+Enter with actual Ctrl+Enter behavior. Enter and Shift+Enter insert newlines when Ctrl is required; Command+Enter does not submit. Browser preference survives reload.
- Removed Telegram settings, startup and remote endpoints. Moved Codex quota to the top of settings with an unavailable placeholder and a readable dark theme heading.
- Provider selection uses the web-only configuration file and runtime arguments. Third-party providers do not require OpenAI authentication. OpenRouter selection is a single change; saved keys and explicit provider choices are preserved. Switching back to Codex rereads host credentials. Active tasks/approvals block switching; failures restore the actual selection.
- Web password and Cloudflare Access protection remain separate and unchanged.

Validation: 146 unit/service integration checks, 51 tray checks and 42 UI scenarios across three widths and both themes. A real Windows Codex process verified ephemeral authentication without credential-file writes. The installed service is healthy; production UI checks at 375px/light and 1440px/dark confirmed the removed controls, top quota and version. Models/quota are readable; removed endpoints and forged account mutations are rejected. Host credentials/configuration, registry token and startup path remain unchanged; native Codex remains running and Access reads both allowed emails. No model messages were sent. Phone/Internet continuous use and Windows reboot were not tested. Originally a local build, these changes are included in the 1.4.4 prerelease without separate 1.4.3.11 assets.

Protocol reference: [OpenAI App Server external token mode](https://learn.chatgpt.com/docs/app-server#3c-log-in-with-externally-managed-chatgpt-tokens-chatgptauthtokens). The host-read-only lifecycle is a constraint of this project's implementation.
