# Feature: Desktop project ID synchronization

Setup: current Windows Codex desktop with local projects, including an empty project and a task assigned to a project whose root differs from the task's cwd. Start the current checkout on `http://127.0.0.1:4173/`. The old `electron-saved-workspace-roots` list may coexist with `local-projects`.

1. Open the sidebar. Confirm the local project names and order match desktop, empty projects appear, and explicitly assigned tasks stay in their projects regardless of cwd. ChatGPT cloud projects are not presented as local work projects.
2. In desktop, rename/add/reorder/remove a disposable local project and move a test task between projects. Keep the page visible. Expect changes within approximately five seconds, without reloading. Return from a background tab and confirm the sidebar refreshes. Refresh the page and confirm memberships remain correct.
3. Open a project's new-task control. Expect the registered project root, rather than a historical task's unrelated execution directory. Do not send a model request during this check.
4. Temporarily fail the project-state response. Expect the last successful sidebar to stay visible and recover when connectivity returns.
5. Rename/reorder a disposable local project from the web. Expect a targeted modern-store mutation that preserves unrelated desktop state. Removing a project preserves task files and makes its assigned tasks projectless. A conflicting desktop write is rejected instead of replaced.
6. Verify 375x812 and 768x1024 in light and dark themes. Expect no horizontal page overflow or extra project ID text in project titles.

Automated: `node scripts/test-project-sync.cjs` runs the real application with synthetic project/history responses and network failure injection. Playwright is used because these interception and mutable fixture scenarios are not supported by the in-app browser bridge. It records responsive screenshots and request counts under `output/playwright/`; no model work, real project mutations, or credential access is performed.

Unit commands: `node node_modules/vitest/vitest.mjs run src/workspaceProjects.test.ts src/api/codexGateway.workspace.test.ts src/composables/useDesktopState.test.ts src/api/codexGateway.test.ts`, and `node node_modules/vitest/vitest.mjs run src/server/codexAppServerBridge.archive.test.ts -t "modern project workspace state"`.

Performance audit: project reads share an in-flight promise and a one-second cache. Visible tabs perform one metadata check about every five seconds; hidden tabs skip network checks. Unchanged metadata does not request history pages. Changed metadata fetches one normal thread-list page and uses existing pagination. Realpath results are deduplicated within each server read. The initial bundle remains about 540 KB / 170 KB gzip; no new library is added. Record live endpoint timing and payload size separately from synthetic fixture results.

Cleanup: remove only disposable test projects via the desktop UI. Do not delete real project directories or original conversations. Synthetic fixtures change no desktop files. Stop test browser processes; leave port 4173 running. Screenshots are ignored by Git.
