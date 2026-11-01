# 1.5.1 本地修订 / Local revision

2026-10-16。仅本地安装，未公开发布。

桌面 Codex 正在运行的聊天，网页只读取磁盘历史时可能拿到旧的 interrupted 状态，因而显示“任务已停止”，侧栏也缺少加载圈。现在打开聊天即只读订阅桌面实时状态，合并实时轮次与已有历史；无需先从网页发消息或取得控制权。首次快照和后续状态更新同步到侧栏，既有控制状态轮询也可重连订阅。

实时运行状态优先于旧历史的停止标记；任务结束后取消加载圈。桌面连接断开时显示“状态待确认”。保留显式发送、控制权校验、未确认送达保护和桌面写入锁，不自动发送、停止、接管或重新执行任务。

Opening a desktop-originated chat now follows its live desktop owner without acquiring a writer or sending a turn. Live state overrides stale interrupted disk history and updates the sidebar working indicator. Completion clears the indicator; a lost desktop connection is shown as uncertain. Existing control, delivery, and writer protections remain intact.

验证：413项网页测试及类型检查、51项托盘测试通过，包含并发只读订阅、首次快照、运行/完成切换、侧栏推送与轮询同步；三轮实际组件界面覆盖运行、完成、停止及未知状态。真实桌面只读订阅确认当前任务 active/inProgress；安装后的实机网页刷新后显示“任务运行中”、侧栏旋转加载圈和未取得网页控制权。配置保留验证与截图另存私人验收记录。
