# 全部版本与切换 / Version history and switching

[GitHub 全部历史发行版 / All releases](https://github.com/I-am-TonyWu/codex-web/releases)

| 版本 / Version | 类型 / Channel | 内容 / Changes | 下载 / Download |
|---|---|---|---|
| 1.4.3.9 | 预览 / Pre-release | 桌面持有历史会话时通过本机协同通道发送、同步结果及审批 | [v1.4.3.9](https://github.com/I-am-TonyWu/codex-web/releases/tag/v1.4.3.9) |
| 1.4.3.8 | 预览 / Pre-release | 修正占用状态缓存、原对话写入重查、手动发送重试 | [v1.4.3.8](https://github.com/I-am-TonyWu/codex-web/releases/tag/v1.4.3.8) |
| 1.4.3.7 | 预览 / Pre-release | 网页终端控制、交接、旧请求拒绝、发送去重；桌面释放暂不可用 | [v1.4.3.7](https://github.com/I-am-TonyWu/codex-web/releases/tag/v1.4.3.7) |
| 1.4.3.6 | 稳定 / Stable | 网关错误、原对话重试、闲置释放及主机沙箱修复说明 | [v1.4.3.6](https://github.com/I-am-TonyWu/codex-web/releases/tag/v1.4.3.6) |
| 1.4.3.4 | 历史稳定 / Historical stable | 项目归属、桌面项目同步、Mermaid | [v1.4.3.4](https://github.com/I-am-TonyWu/codex-web/releases/tag/v1.4.3.4) |
| 1.4.3.1 | 首个公开版 / First public release | 托盘、身份验证、技能插件和文件访问 | [v1.4.3.1](https://github.com/I-am-TonyWu/codex-web/releases/tag/v1.4.3.1) |

1.4.3.2、1.4.3.3、1.4.3.5 为之前的中间构建，没有单独公开发布；它们的功能已合入上述发行版。这里不把不存在的发行附件列为可下载版本。

## 切换步骤 / Switching

1. 如果从 1.4.3.7 回退，先把暂停队列中的消息复制保存，并在网页移除待发送队列。1.4.3.6 及更早版本会自动继续旧队列，不能用新版的暂停状态约束旧版。然后等当前任务结束，退出托盘。不要删除 Codex 数据、密码、Token 或站点配置。
2. 从指定版本页下载 `CodexWebTray.exe` 和校验文件，校验 SHA256。
3. 在原来的固定路径替换 EXE，启动并刷新网页。可以升级，也可以回退；开机自启路径不变。
4. 回退不撤销已经执行的模型任务或文件修改。新增功能的控制凭证在服务重启后需要重新取得。

Before downgrading from 1.4.3.7, copy and remove pending queue messages: older versions automatically drain stored queues. Wait for tasks to finish, quit the tray, verify the chosen EXE's checksum, replace it at the same fixed path, launch and reload browsers. Preserve user configuration and secrets. Switching versions does not undo previously executed tasks or file changes.

`/releases/latest` 只指向最新稳定版；预览版独立标为 Pre-release，全部版本在 `/releases` 查看。旧标签、版本说明和文件不删除、不替换。
