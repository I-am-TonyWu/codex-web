# 1.4.7 本地修订 / Local revision

## 中文

- 插件页只展示本机已安装插件，保留已停用项；搜索、排序和定时同步也使用安装列表。
- 技能页只展示独立安装在个人技能目录中的技能，隐藏系统技能和插件附带技能。搜索只筛选个人安装内容，不再混入注册表推荐项；底层系统技能保留。
- 个人技能卡片增加启用开关，写入 Codex 原生技能配置。保存时防止重复点击，失败保留原状态，详情及输入框选择列表同步更新；刷新能重新读取技能状态。
- 应用页签显示为“应用连接”，说明 GitHub、Google Drive 等外部服务的数据、工具连接用途。补齐相关中文标签，窄屏及大字号页签不再竖排。
- 插件列表不再等待应用连接加载；页签保持自身高度，避免较多 MCP 卡片把页签挤成细线。
- 定制版本采用三段编号。本版 1.4.7，下一版 1.4.8；本次仅本地安装，没有上传 GitHub。

## English

- The plugin directory shows installed plugins, including disabled ones, for listing, search, sorting, and synchronization.
- Skills shows standalone personal installations. Bundled system and plugin skills remain available to the runtime but are hidden from this management list. Search filters personal installations.
- Skill cards have enable switches backed by native Codex configuration. Failed writes preserve the previous state; details and composer choices refresh after successful writes. Manual refresh reads current skill status.
- The Apps tab explains its role as external service connections and supports translated labels and readable tabs at narrow widths and large font sizes.
- Installed plugins render independently of app connection loading. Tabs retain their height when the MCP section has many entries.
- This is local revision 1.4.7; the next version is 1.4.8. No GitHub release was created.

## 验证 / Verification

- Vue 类型检查、技能目录和缓存回归测试通过。
- 三轮隔离 UI 开关、键盘、刷新读回、保存失败及已安装插件过滤验证通过。
- 三轮真实 Codex app-server 个人技能配置启用/停用读回通过，使用隔离目录，无真实模型请求。
- 本机 1.4.7 服务 Healthy，实际远程网页检查完成；51 项托盘与安全配置测试通过，升级前后配置指纹一致。
