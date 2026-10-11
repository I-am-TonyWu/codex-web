# 1.4.8 本地修订 / Local revision

## 中文

- 优先使用 Codex 原生解析的技能描述，磁盘读取兼容 YAML 多行 `>`、`|` 和引号格式，修复只显示格式标记的问题。
- 卡片说明完整换行，取消两行截断；详情说明支持换行和长技术名称。
- 卡片及详情默认显示中文。英文或混合语言说明通过本机已登录 Codex 做全文翻译，保留技术名称、代码块、命令和链接地址；中文说明直接展示。
- 译文按源内容缓存，新技能及内容更新自动生成；等待及失败显示中文提示，完成后更新页面。相同内容不重复请求翻译。
- 长说明按段分批翻译，避免单次全文输出超时；命令、代码及链接先保护，再原样还原。
- 翻译为临时只读调用，禁用 Shell、插件、应用、记忆和多代理能力，不执行说明中的操作、不修改技能原文件。首次生成使用 Codex 额度。
- 详情仅读取已安装个人技能的路径。保持已有技能启用开关及设置。
- 本版 1.4.8，仅本地安装，未上传 GitHub。下一版 1.4.9。

## English

- Skill descriptions use native Codex metadata with multiline YAML fallback support. Cards wrap complete descriptions instead of clipping them to two lines.
- Cards and details display Chinese text. A host Codex translation call preserves technical identifiers, code, commands, links, and Markdown; existing Chinese text is retained.
- Content-based persistent caching handles newly installed and updated skills. Chinese pending/error messages are replaced when translation completes.
- Long documents are translated in bounded chunks. Protected code, commands, and link targets are restored verbatim.
- Translation uses an ephemeral read-only call with shell, plugin, app, memory, and multi-agent capabilities disabled. Original skill files and enablement remain intact. Initial translations use Codex account quota.
- Detail reads are limited to installed personal skill paths.
- Local revision 1.4.8 has not been published to GitHub. The next version is 1.4.9.

## 验证 / Verification

- 技能解析、中文缓存、更新失效、失败与代码保留相关测试通过；Vue 类型检查通过。
- 三轮 UI 完整中文卡片、详情、刷新、新技能发现及失败状态验证通过。
