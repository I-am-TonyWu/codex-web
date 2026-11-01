# 1.4.9 本地修订 / Local revision

2026-10-14；2026-10-15 补齐网页版本显示。

- 托盘仍使用 `--sandbox-mode workspace-write --approval-policy on-request`，覆盖了网页服务在 1.4.6 已设置的完全访问、无需审批默认值。改为 `--sandbox-mode danger-full-access --approval-policy never`。
- 网页服务启动及网页发起的新任务统一使用完全访问本机文件和网络、无需沙箱审批；桌面自行发起的任务继续使用桌面权限设置。
- 10 月 15 日修复托盘显示 1.4.9、网页仍显示 1.4.8：网页构建与打包说明读取托盘 Program.Version，重新生成网页资源与内嵌 payload；构建时检查资源包中的网页版本，不匹配则拒绝生成 EXE。后台 CLI 保持原文件。工具登录及需要用户选择的询问仍遵循各自机制。
- 本版仅本地构建与安装，不上传 GitHub；下一版为 1.4.10。

The tray launcher previously overrode the web service defaults with `workspace-write` and `on-request`. It now starts the service with `danger-full-access` and `never`, matching the existing web-turn policy. Desktop-originated tasks retain their desktop permission settings. The October 15 correction rebuilds the frontend to display 1.4.9. Frontend and packaging versions come from Program.Version, and tray builds reject a mismatched frontend payload. The backend CLI remains unchanged. Authentication and tool input prompts keep their existing behavior. This revision is local only; the next version is 1.4.10.

## 验证 / Verification

- 37 项网页权限/桌面协同测试及 51 项托盘测试通过。
- 旧安装版检查复现 workspace-write/on-request；新安装版的实际服务命令行及原生 config/read 均确认 danger-full-access/never，重启服务后仍成立，状态 Healthy。
- 10 月 15 日补充验证：旧资源包被构建检查拒绝；类型检查、前端构建、重新打包及 51 项托盘测试通过。安装后 HTTP 主资源与浏览器实际设置按钮均显示 1.4.9，服务 Healthy，完全访问/never 设置继续生效。6 个配置/凭据文件及 1 个注册表凭据指纹保持一致。
- 未向真实聊天发送测试任务，未重启 Windows。
