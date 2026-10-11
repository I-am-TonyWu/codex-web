# 1.4.3.10 — 账户登录与重新加载修复 / Account recovery

2026-10-10。本版原为本地构建，现已合入 [1.4.4 预览版](releases/1.4.4.md)，没有单独发行附件。账户管理相关界面已在 1.4.3.11 移除，以下记录当时的修复。Originally local; included in 1.4.4 without separate assets. Account management was subsequently removed in 1.4.3.11.

## 中文

点击网页设置中的“账户 → 重新加载”时，旧实现会停止共享聊天后台，再等待额度查询。Windows 上的临时查询进程未完全关闭就清理 SQLite 文件，会产生 `EBUSY` 错误。失败响应或网关 HTML 又被前端直接当作 JSON 解析，显示 `Unexpected token '<'`，账户设置无法继续操作。

- 重新加载只读取当前主机的登录快照并在后台查询额度，不停止聊天进程、不重新读取整段聊天历史。额度暂时不可用时保留账户、历史与已有额度快照。
- 账户操作失败返回 JSON 错误信封；前端识别网关 HTML、过期登录与无效响应，显示可重试的中文提示，恢复按钮状态。
- 登录使用托盘所配置的 Codex 可执行文件和独立临时目录。取消、启动失败或超时会停止临时进程；新登录通过验证并成功保存后才替换主机登录。支持主机浏览器已经完成的 localhost 回调，校验回调端口、路径和当前登录状态值。
- 在活动任务或审批期间阻止更换运行账户；登录、取消、完成与切换请求串行处理。失败的最终保存会恢复旧凭据。
- 临时查询有完整生命周期超时，等待子进程 `close` 后再清理 Windows SQLite 文件；清理失败不冒充额度查询失败。账户配置通过临时文件原子替换。
- 提供方设置同样识别非 JSON 响应；切换失败后重新核对实际提供方，不保留误导的下拉框选项。
- 重置账户运行后台后，桌面协同连接仍能重新建立并按原规则清理闲置订阅。

本机连续三次重新加载均返回成功 JSON，额度恢复为 `ready`，Codex 后台进程 ID 保持不变。网页密码、Cloudflare Token、站点设置、自启路径及 MXC 沙箱配置保留。刷新远程网页即可加载新前端。

验证：105 项相关单元测试、1 项真实 Windows Codex 只读临时查询、51 项托盘监控/安全测试、24 个手机/平板尺寸及明暗主题页面场景；已安装版本的账户重新加载页面也通过验证。类型检查、前端/CLI 构建、EXE 嵌入资源与安装文件比对通过。没有发送模型消息。真实新账户 OAuth 全流程和手机外网现场仍需实际使用验收。

## English

This is a local build and installation, not a GitHub release.

Reloading accounts previously stopped the shared chat runtime and waited for quota inspection. Temporary Windows Codex processes were cleaned up before their SQLite handles closed, producing `EBUSY` errors. The UI also parsed HTML gateway responses as JSON, exposing `Unexpected token '<'` and leaving account settings unusable.

- Account reload imports the current desktop login and refreshes quota in the background without restarting chat or reloading conversation history. Quota failures preserve the active account and its previous snapshot.
- Account failures use JSON error envelopes. Account and provider clients report gateway/login pages in readable language and restore button state after failure.
- OAuth login uses the configured Codex executable and a separate temporary home. Cancellation and timeout stop that child; verified credentials replace the existing login only after a successful commit. The callback must match the current OAuth state, port and path. Already completed local callbacks are supported.
- Account changes are blocked during active tasks or approvals. Account mutations are serialized; a failed final state commit restores the previous credentials.
- Temporary inspections have lifecycle timeouts and await process `close` before deleting Windows SQLite files. Cleanup failures do not mask a successful inspection. Account files are replaced atomically.
- Failed provider changes recheck the actual provider and restore the displayed selection. Desktop coordination can reconnect and retain idle cleanup after runtime reset.

Live verification: three account reloads returned successful JSON, quota became ready, and Codex runtime PIDs stayed unchanged. Password, Cloudflare token, site settings, autostart and MXC configuration were preserved.

Validation: 105 related unit tests, one installed Windows Codex read-only inspection, 51 tray monitoring/security tests, 24 responsive/theme UI scenarios and an installed-service account reload UI check. Type checking, frontend/CLI builds, embedded resources and installed executable comparison passed. No model messages were sent. Full live OAuth enrollment and a physical phone over the public tunnel were not exercised.
