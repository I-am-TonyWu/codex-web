# 1.4.3.6 — 原对话重连与闲置会话释放 / Original-thread retry and idle writer release

## 中文

历史对话可能由桌面 Codex 的后台会话继续持有写入权，即使桌面没有显示该聊天、网页也只有一个登录。这版改善网页自己的会话管理和原对话重连。

- 打开历史只读取内容；发送消息时才取得写入权，减少查看记录造成的占用。
- 网页任务结束或离开闲置对话时，优雅释放网页自身会话；等待 Codex 完成关闭与保存后才报告释放成功。不会停止执行中的任务或释放桌面进程的会话。
- 占用提示增加“重试原对话”，保留原对话 ID、历史和未发送草稿，成功后等待手动发送；原有独立分支接续功能保留。
- 不再缓存已经完成的只读恢复结果，避免锁已释放却仍重复提示。
- 中文提示明确说明后台会话与界面选择不同。密码、Token、自启和沙箱配置保持现有设置。

验证：78 项生命周期/API/状态测试、7 项相关桥接测试；两个真实 Codex app-server 在隔离目录验证原 ID 交接，以及通过本地模拟服务完成失败任务后自动释放会话；浏览器覆盖 375×812、768×1024、浅色/深色，另复测 8 种错误展示与分支接续流程。没有真实模型请求。类型检查及网页/CLI/EXE 构建通过。

限制：网页不能强制夺取另一个进程的真实写入权。若桌面以后再次加载并持有同一对话，应先让它正常释放，再点“重试原对话”；也可选择独立分支。未运行 Docker 的提供方/鉴权矩阵；Windows 重启和手机现场复测需另行验收。

## English

An idle desktop Codex session can retain a thread writer even when that conversation is not visible. This release improves the web client's ownership lifecycle and reconnects the original thread safely.

- History browsing reads without resuming; sends acquire the writer when needed.
- Completed web turns and navigation away from inactive sessions gracefully unsubscribe the web's own writer. Release is confirmed only after native shutdown; active or externally owned sessions are never stopped.
- “Retry original conversation” retains the ID, history and rejected draft. Reconnection never automatically sends a message or creates a fork. Independent continuation remains available.
- Completed resume results are no longer cached, preventing stale read-only responses after release.
- Existing credentials, startup settings and sandbox configuration are preserved.

Validation: 78 lifecycle/API/state tests and 7 bridge tests; two isolated native app-servers test original-ID handoff and automatic cleanup after a localhost-only simulated failed turn. Browser checks cover phone/tablet, light/dark, original retry and independent continuation. No real model requests. Typecheck and web/CLI/EXE builds pass.

Limits: another process's active writer cannot be forcibly taken over. The Docker provider/auth matrix, Windows reboot and physical phone acceptance were not run for this release.
