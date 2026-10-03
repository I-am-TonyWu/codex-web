# 1.4.3.2 — Mermaid 流程图 / Mermaid diagrams

修复聊天中 Mermaid 代码块只能显示源码的问题。网页在主机提供的本地资源中按需加载 Mermaid，直接绘制图表；支持中文换行、明暗主题、原始代码切换和可滚动的大图预览。语法错误保留代码并显示原因，消息生成中等待完成再绘图。计划和嵌套列表也支持渲染。

此更新只修改网页渲染，不改写聊天记录、网页密码或 Cloudflare Token。替换同一路径中的 EXE 并重启托盘后，刷新远端网页即可使用。正在运行的工作任务无需重新发送。旧的迁移包是静态快照，迁移后如需本修复，请再替换其中的托盘 EXE。

Fix Mermaid fences showing only source code in conversation messages. Mermaid loads on demand from locally bundled assets, with Chinese multiline labels, light/dark themes, source toggling, and a scrollable full-size preview. Invalid syntax preserves the source; streaming messages wait until finished. Plans and nested lists are supported.

This update changes rendering only, preserving conversation data, web passwords, and Cloudflare tokens. Replace the EXE at its existing path, restart the tray, then refresh the remote page. Existing work does not need to be resent. Older migration bundles remain static snapshots; replace their tray EXE after restoring if this fix is needed.

Validation: frontend/CLI builds, focused browser regression at 375×812 and 768×1024 in both themes, source/preview/stream/plan/list/error handling, SVG ID isolation, script/HTML filtering, lazy loading and bounded-cache checks. Tests use synthetic messages and do not make model requests.
