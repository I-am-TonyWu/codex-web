# Desktop extension synchronization and composer plugin selection

Prerequisites: Windows Codex and web service use the same CODEX_HOME and account. Install an enabled skill/plugin in desktop Codex. Use light/dark themes at 375×812 and 768×1024.

1. Open the composer’s 技能 and 插件 menus. Verify installed user/plugin skills and enabled installed plugins appear, while disabled entries cannot be selected in the composer.
2. Search by name or Chinese summary. Press 展开 at the right of an item. Verify the menu stays open, the summary wraps, and the complete author description is readable by scrolling. Collapse it without selecting the item.
3. Select a skill and plugin, type a draft, reload. Both chips and text must persist. Send in a disposable task: the RPC contains `skill` for the exact skill path and `mention` for `plugin://<plugin-id>`. Queued messages must retain the same distinction.
4. Add a temporary SKILL.md in CODEX_HOME/skills. Reopen the menu or wait for the visible page’s 30-second poll. Verify the new skill appears without restarting the service. Remove the temporary file/directory after the test; verify removal after the cache expires.
5. Install a plugin in desktop Codex. Remote plugin catalog synchronization runs in the background at most once per 90 seconds. After completion and the next visible-page refresh, check the composer and sidebar directory. A slow remote catalog must not block local lists or chat.
6. Disconnect the catalog/API in a test browser. Verify an explicit synchronization status and preservation of the previous list. Reconnect and retry. No empty-list replacement on failure.
7. In the sidebar directory, try an installed plugin and check its native mention accompanies the new task. Plugin message chips are labels, not invalid file links. Skill chips still link to SKILL.md.

Chinese summaries are local annotations for known skills/plugins, not automatic translations of all future content. Existing Chinese descriptions are preserved; unknown English descriptions remain complete. No translation service receives descriptions or paths.

Automated coverage: `node scripts/extensions-regression.cjs`; `node node_modules/vitest/vitest.mjs run src/server/extensionCatalog.test.ts src/api/extensions.test.ts`. The browser fixture intercepts requests and mutates test state to simulate additions/offline behavior; it never sends production turns. Screenshots/reports are in output/playwright. The separate native smoke test uses a disposable task, then archives it.

Performance audit: one shared browser fetch supplies both menus; 3-second client coalescing and 5-second server cache. Server cache is bounded to eight working directories, pending reads coalesce, and one remote refresh runs per service. Visible tabs poll every 30 seconds; hidden tabs do not. Native plugin/installed avoids sending the entire marketplace (previously approximately 1.3 MB). Measured local combined snapshot: 97 skills and 17 plugins, approximately 114 KB before compression. ETag returns 304 with no payload when unchanged. No translation-model calls. Sidebar full marketplace fetch occurs only when opening/refreshing its directory, not on every composer poll.

Native validation: Vercel mention + vercel:auth skill accepted, task completed with expected names. A newly written Chinese test skill appeared with its exact Windows path, then was removed. Docker provider/auth matrix is unavailable on this Windows environment; native unit, browser, production build, and public CLI smoke checks are used instead.
