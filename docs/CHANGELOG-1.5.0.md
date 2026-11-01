# 1.5.0 本地修订 / Local revision

2026-10-15。仅本地安装，未公开发布。

- 侧栏聊天移除悬浮垃圾桶，归档收纳到选项菜单并保留确认和恢复方式；技能与自动化入口缩小，统一线框图标。空项目与非空项目均可完全折叠。
- 文件查看/下载、终端、Git 分支收进标题省略号菜单。网页控制选项改为向上展开的独立浮层，逐行显示操作，桌面悬浮或键盘聚焦显示省略号，触屏保留入口。
- 设置旁显示 5h、7d 剩余额度；读取失败显示占位，不推断为零。设置内上下文紧随 Codex 额度，底部改为仓库短链接。
- 技能页顺序为技能、插件、应用连接；个人技能在 MCP 上方，卡片移除文件夹按钮。沿用个人技能开关与中文说明。
- 错误反馈入口打开本仓库 GitHub Issue 草稿，用户补充并提交；仅附带最少技术信息，不包含聊天、路径、地址、异常正文或凭据。
- 全局新建聊天默认无项目，中文界面统一使用“聊天”。项目归属通过原生 project/list、project/import、thread/metadata/update 保存并读回确认，同时更新桌面兼容数据；用项目 ID、迁移标记或唯一根目录映射旧项目。刷新优先按有效原生 projectId 分组，未迁移历史保留原有 JSON 归属，解决旧缓存被客户端覆盖后归属丢失的问题。
- 保留本地 1.4.9 权限修复及已完成的代码优化、安全边界和兼容行为。定制版本继续三段编号，下一版 1.5.1。

The sidebar uses compact navigation and confirmed archival from the options menu. File access, terminal, and Git controls live in the title menu. Web control actions open upward in a separate popover. The footer displays remaining 5h/7d quota; context usage follows quota in settings, with a short repository link at the bottom. Directory tabs are Skills, Plugins, Apps, with personal skills above MCP and no folder button on skill cards. Feedback opens a repository Issue draft with minimal technical metadata. New chats are projectless by default. Project membership is saved and verified through native Codex APIs rather than relying on the desktop JSON cache. Existing local permission and code optimization fixes are retained. Local only; next version 1.5.1.

## 验证 / Verification

- 类型检查及 410 项单元/服务集成测试通过；包括不同 ID 的项目映射、未迁移历史归属、保存失败、读回不一致、附件历史和反馈隐私。
- 隔离的真实 Windows Codex 验证移入、移出项目后重启读回，无模型任务；界面测试使用真实组件及隔离数据，不修改用户聊天。
- 私人安装与界面验收记录另存工作目录，不随源码公开。
