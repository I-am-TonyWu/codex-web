# 1.6.2 — 发送恢复与控制状态修复

2026-11-21 发布至 GitHub。

- 修复网页服务重启后，标签页一直复用失效终端身份的问题。只读控制查询可重新注册；发送、停止、接管等写操作不会自动重放。
- 接管与发送前重新读取控制版本，避免使用过期的运行 epoch 或控制凭证。网页接管成功后还会检查原生写入状态，提示依据本次检查结果；检查失败时不会用缓存的“空闲”状态误报成功。“取得网页控制”不再暗示桌面写入锁已经释放。
- 控制身份优先绑定网页密码登录会话，消除 Cloudflare Cookie 排列或刷新导致的身份变化。
- 发送前核对已有回执：已确认发送时解除旧标记并提示先查看历史，本次不重复发送；明确拒绝时允许当前手动重试；未知结果继续保留保护。迟到响应只能清除自己的发送标记，不能清除更新的请求。
- 执行后台在提交消息前初始化失败时，记录为明确未发送，避免永久保留成不确定回执。
- 将“发送待确认 · 核对”直接显示在会话控制栏，将回执核对和手动确认入口移出折叠说明。恢复或清除标记均不会自动发送草稿。

## 桌面占用仍有兼容性限制

实测当前桌面 Codex 26.1117.4957.0 打开测试聊天后取得原生写入锁，离开界面后后台仍可能保留它；另一个进程的原生归档请求也被拒绝。这个桌面版本不再提供本项目此前使用的旧 `codex-ipc` 通道。**本版尚不能远程释放这类桌面占用，不提供无效的“关闭所有聊天即可释放”按钮。** 网页控制和原生写入锁是两层状态。

使用方法：发送待确认时先点击“发送待确认 · 核对”，检查最新历史；结果仍未知时，只有自行核实后才能点击“已核对历史，允许下一次发送”。恢复连接后手动发送，程序不会自动重发。桌面仍占用时保留草稿并如实提示；已有的“在网页接续”功能创建独立分支，不会释放原对话的写入锁。

验证：类型检查、431 项网页测试通过（1 项原有跳过）、66 项托盘检查通过，生产前端/CLI/EXE 构建通过。4 组浏览器测试覆盖两端接管、独立草稿、待确认恢复、375/768 像素及明暗主题；本机实际界面验证桌面占用提示，无真实模型发送请求。未实测手机外网弱网或 Windows 重启。

## English

Published to GitHub on 2026-11-21.

Recover stale browser registrations on read-only control queries after a service restart. Refresh control versions before claiming or mutating a chat. Prefer the web login cookie over Cloudflare cookie ordering when deriving control identity.

Reconcile existing delivery receipts before sending: confirmed acceptance clears the old marker without resending on that click; confirmed rejection permits an explicit manual retry; ambiguous results remain protected. A late response cannot clear another request's marker. Executor initialization failures before submission are recorded as not sent. Receipt checks and explicit acknowledgment are visible outside collapsed help, with no automatic message replay.

**Desktop writer release remains unresolved for the tested desktop version.** Leaving a desktop chat does not guarantee release, and native archival from a different process is also rejected. The former local desktop coordination pipe is absent. Browser control recovery does not forcibly release a native desktop writer. No process termination, lock deletion, credential changes or silent archival are used.

Validation: type checks, 431 passing web tests (1 skipped), 66 tray checks, production builds and four responsive browser scenarios; installed local UI/read-only API checks. No real model requests. Mobile WAN conditions and Windows reboot were not tested.
