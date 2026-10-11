# 1.4.4.1 本地修订

## 中文

- 网页只连接主机 Codex，移除提供方、第三方密钥与 API 格式设置。忽略旧网页提供方配置；旧切换和代理接口返回明确的停用提示，不读取密钥、不重启后台、不修改主机登录或配置。
- 修复第三方选择导致网页后台失去主机登录态、托盘健康检查反复重启的问题。
- 任务状态移到输入框上方，以 12px 小字显示。控制区默认折叠，只显示当前控制状态，展开后显示接管、刷新、检查与交接说明。沿用已有心跳和任务终态，连接异常不会显示为完成。
- 保留右上角终端和 Git 分支功能，待用户决定后续展示方式。Antigravity 仅评估，未实现新的切换入口。
- 本轮为本地构建与安装，未上传 GitHub。

## English

- Connect only to the host Codex. Remove provider and third-party credential settings; ignore saved web provider overrides. Retired switching and proxy endpoints return an explicit disabled response without spawning or restarting the backend or changing host credentials.
- Prevent provider overrides from suppressing host authentication and causing repeated tray health-check restarts.
- Move task status above the composer in compact text. Collapse conversation controls by default and reveal actions on expansion. Reuse existing state and polling; a disconnected backend is never presented as a completed task.
- Keep terminal and Git controls unchanged. Antigravity integration is evaluated only. This revision is local and has not been published to GitHub.
