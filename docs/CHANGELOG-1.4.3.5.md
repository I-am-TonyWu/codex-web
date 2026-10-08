# 1.4.3.5 — RPC errors and desktop-owned conversations

## 中文

修复：桌面客户端持有对话写入锁时，网页虽然能读到历史，却误认为可以发送。内部 RPC 拒绝被返回为 HTTP 502，可能被 Cloudflare 替换成 HTML 网关错误页。

- 内部 RPC 错误通过 HTTP 200 JSON 错误信封传递，保留真实原因；身份验证仍保留原有 HTTP 状态。
- 只读历史恢复带有明确标记，发送前重新确认写入权限。占用提示改为中文，不自动重发消息。
- 增加“在网页接续（保留原对话）”按钮。用户点击后创建独立分支，保留历史、工作目录及项目归属，标题增加“· 网页接续”。未发送的文字、图片、附件及技能选择恢复到输入框，等待用户手动发送。
- 修复接续时路由切换可能清空恢复草稿的问题；处理已显示的发送异常，避免未捕获的 Promise 错误。
- 真正的网络/网关错误显示可读提示，不再铺满 HTML。无法确认是否送达时，不自动重复请求。

使用：更新本机托盘程序后，刷新远程网页。若原对话仍由桌面端占用，点击接续按钮，检查恢复的草稿后手动发送。原对话不会被改名、删除或强制取消。两个对话的后续消息独立，项目目录仍相同；此版本没有强制接管桌面写入锁。

验证：61 项前端/API/状态单元测试、7 项相关桥接恢复测试通过；两个真实 Codex app-server 在隔离的 CODEX_HOME 中验证只读冲突和独立分支写入权限；浏览器验证 8 个尺寸/主题/错误展示组合及完整草稿恢复、项目保留、手动发送流程。未发送真实模型请求。现有归档测试全量运行另有两项 Windows 环境限制（符号链接权限、POSIX 文件权限断言），未修改这些无关测试。

此版本先用于本地修复，GitHub Release 和迁移数据包尚未发布更新。

## English

Fixed a desktop-owned thread being treated as writable after a read-only history fallback. Internal RPC rejections previously used HTTP 502 and could be replaced by Cloudflare's HTML gateway page.

- Carry application failures in HTTP 200 JSON error envelopes, while preserving authentication HTTP statuses.
- Mark read-only resumes and block model turns when another process owns the writer.
- Add an explicit web continuation action that forks history, keeps the directory and project assignment, and restores the rejected draft without submitting it automatically.
- Restore drafts only after route synchronization settles; handle displayed send rejections without unhandled promises.
- Replace gateway HTML with an actionable connection message. Never blindly retry a write whose delivery is uncertain.

Refresh the remote page after updating the tray executable. If the desktop still owns the original conversation, choose the continuation action and send the restored draft manually. The original is preserved. Subsequent messages in the two threads are independent; both retain the same working directory. This does not forcibly take over a desktop writer lock.

Validation: 61 frontend/API/state unit tests, 7 focused bridge tests, two isolated real app-server processes, eight responsive/theme/error UI cases, and the full synthetic continuation/draft/send flow. No real model requests were sent. Two unrelated full archive-suite assertions have Windows-specific limitations (symlink privileges and POSIX permissions).

Local repair build; GitHub Release and migration data bundle have not been updated yet.
