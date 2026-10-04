# Chat project assignment

Prerequisites: Windows Codex with at least two local projects, a projectless work chat, and codex-web 1.4.3.4. Use a disposable test chat; do not submit a model turn.

1. In the web sidebar, right-click the ordinary chat (on mobile, tap its ellipsis). Choose Project.
2. Search for and choose a project. Expect all options to be disabled during save, one POST, then the chat appears under the selected project.
3. Reload the page. Expect the same assignment and unchanged chat messages / execution cwd. Check the desktop sidebar too; a desktop version that caches metadata may require refresh/reopen.
4. Move the chat to the second project, then choose No project (ordinary chat). Expect exactly one sidebar row at each step, even when cwd is inside the old project.
5. Simulate a 409/network failure with route interception. Expect a visible error, retry enabled, and the old assignment preserved.
6. Check project search, selected check mark, Cancel, Escape, and light/dark UI at 375×812 and 768×1024. Empty projects should also be selectable.

Cleanup: restore the original project assignment; archive only a disposable test chat. No history files or folders are moved/deleted.

Performance audit: one metadata write per click, no model RPC, no per-project scan/fanout. Existing five-second visible-page polling and one-second shared cache remain; successful writes invalidate the cache, failures do not. Browser fixtures measure two or three metadata requests over 10.5 idle seconds. The server reads the latest global-state snapshot once and refuses a detected concurrent write.

Automated: `node scripts/test-project-sync.cjs` (Playwright CJS is used because request interception, synthetic network failures, and localStorage setup are required). Reports/screenshots are under output/playwright.
