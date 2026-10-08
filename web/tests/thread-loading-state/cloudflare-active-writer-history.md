# History loading through a reverse proxy with a desktop writer

Prerequisites: desktop Codex owns an existing thread; the web server uses the same CODEX_HOME; an authenticated browser accesses the web server through Cloudflare Access/Tunnel.

1. Open the desktop-owned conversation in the remote web UI.
2. Check POST /codex-api/rpc for thread/resume: it returns 200 with history, rather than an HTML 502 page.
   The result must also contain `webReadOnlyReason: "thread_writer_conflict"`; history access must not mark the thread writable.
3. Confirm the latest history is visible and desktop work continues without cancellation.
4. Open another, unowned conversation and confirm normal resume behavior.

5. Submit a draft with an attachment. Confirm the Chinese writer-conflict message appears and no `turn/start` is issued.
6. Click “在网页接续（保留原对话）”. Confirm one fork is created, the button is disabled during creation, and the original remains unchanged.
7. Confirm the fork has a distinct “· 网页接续” title, original history, working directory and project membership. Confirm the rejected draft and attachments return to the composer after route synchronization finishes.
8. Send manually. Confirm the request targets the fork, with no automatic submission or repeated original write.
9. Simulate an HTML 502 response. Confirm a readable connection warning replaces the HTML and no write is automatically retried.

Expected: only a specific active-writer resume conflict falls back once to thread/read with includeTurns. Other failures remain errors. Internal RPC rejections use HTTP 200 JSON error envelopes; authentication failures keep their HTTP status. A continuation is an explicit independent fork, not a writer-lock takeover or ongoing synchronization of two copies.

Performance: normal resume remains one RPC; a conflict takes two local RPCs but one browser request. A send against a read-only thread checks resume again and stops before a model call. Existing response trimming and inline-payload sanitization remain in the HTTP pipeline. No new polling, timers, automatic retries, or full-history payloads on the normal send path. Drafts are kept per loaded thread and pruned with thread state; the short route watcher removes itself after restoration or navigation away. The fork action runs only on explicit click and inherits the existing full-history fork cost.

Automation:

- `node node_modules/vitest/vitest.mjs run src/api/codexRpcClient.test.ts src/api/codexGateway.test.ts src/composables/useDesktopState.test.ts`
- `node node_modules/vitest/vitest.mjs run src/server/codexAppServerBridge.archive.test.ts -t callRpcWithArchiveRecovery`
- `node scripts/test-rpc-error-http.cjs` after building the CLI; uses isolated CODEX_HOME and two real app-server processes, without model turns.
- `node scripts/test-writer-conflict.cjs` and `node scripts/test-writer-continuation-app.cjs` against a disposable Vite server (`WRITER_TEST_URL`). Both intercept API traffic or use synthetic messages and never contact a model. Cover 375×812 and 768×1024, light/dark, and complete route/draft/send flow.

Cleanup: no conversation deletion needed. Roll back the web release to restore prior behavior if necessary.
