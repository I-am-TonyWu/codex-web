# 1.6.1 — 远程操作修复

2026-10-31 本地完成；2026-11-01 发布至 GitHub。

- 修复桌面更新删除旧 CLI 后，网页后台仍依赖旧路径的问题；显式路径失效时重新发现已安装的桌面 CLI。
- 分叉显式创建为持久用户聊天。部分 CLI 版本能按 ID 读取分叉，却不在普通列表返回它；网页保存自己创建的分叉 ID，并从原生接口补充缺失的列表项。刷新后仍可找到，避免创建成功后显示“选择聊天”。归档或删除时移除补充记录。
- 上传改用标准 multipart 解析，保留中文文件名和二进制内容，处理 Windows 非法文件名。单文件上限由 32 MiB 提升为 90 MiB，上传读取和 HTTP 请求期限统一为 15 分钟；前端提前校验超限文件并显示具体失败原因。保留上传进度和上传中禁止发送的逻辑。
- 浏览器标签标题固定为 `codex-web`，初始 HTML 和打开聊天后保持一致。
- 项目归属通过原生 RPC 保存并读回。删除直接改写桌面全局缓存文件的步骤：运行中的桌面客户端会从自己的内存覆盖这个文件。网页明确提示原生数据库已保存，但桌面即时显示未确认。

**未解决：运行中的桌面客户端即时显示项目归属。** 实测数据库保存和读取正确，但桌面自己的项目缓存仍显示旧值；目前尚无已验证、可独立集成到托盘的同步通知接口。本版不宣称这一项已经修复，也不重启或结束桌面 Codex。

验证：服务/界面类型检查，420 项网页测试通过、1 项原有跳过，托盘回归及构建通过。实际网页验证 33 MiB 文件上传、从回答分叉及刷新后显示、固定标签标题、项目保存后的限制提示。新建测试聊天发送一条“只回复 OK、不调用工具”的消息，确认原生历史已落盘；未向既有聊天发送测试消息。

本机 Cloudflare Tunnel 独立更新为官方 2026.10.7，SHA256 与 GitHub 发布资产 digest 一致；Windows 服务运行，`/ready` 返回 200，4 条连接。网站密码、Access Token、主机登录与配置文件校验值未变。手机外网弱网连续上传尚未实测。

## English

Local build completed on 2026-10-31; published to GitHub on 2026-11-01. Rediscover the current desktop CLI after an update invalidates the old executable path. Create persistent user forks and retain their IDs when native `thread/list` temporarily omits otherwise readable forks. Keep the browser title fixed at `codex-web`.

Uploads use standard multipart parsing, a 90 MiB file limit, consistent 15-minute deadlines and readable errors. Native project assignments are saved and read back through RPC without racing the desktop's in-memory global state. **Immediate project display synchronization in the running desktop remains unresolved and is explicitly reported by the UI.**

Validation: type checks, 420 passing web tests (1 skipped), tray checks/build, actual browser upload/fork/reload/title/notice checks. One isolated test conversation received a single OK-only model request; existing conversations were not used for test messages. Cloudflared was separately upgraded to verified 2026.10.7; service and tunnel readiness passed.

Sources: [Cloudflare security advisory](https://blog.cloudflare.com/emudhra-certificate-compromise/), [official cloudflared release](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.7).
