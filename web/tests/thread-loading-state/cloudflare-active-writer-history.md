# History loading through a reverse proxy with a desktop writer

Prerequisites: desktop Codex owns an existing thread; the web server uses the same CODEX_HOME; an authenticated browser accesses the web server through Cloudflare Access/Tunnel.

1. Open the desktop-owned conversation in the remote web UI.
2. Check POST /codex-api/rpc: browsing history calls `thread/read`, without `thread/resume` or acquisition of a writer. Reading history must return JSON, rather than an HTML 502 page.
3. Confirm the latest history is visible and desktop work continues without cancellation.
4. Open another conversation and confirm it is also only read. Sending acquires the writer through resume.

5. Submit a draft with an attachment. Confirm the Chinese writer-conflict message appears and no `turn/start` is issued.
6. Click “重试原对话” while the desktop still holds the lock. Confirm no turn or fork is created. Release the idle desktop session through native archive/restore, or close desktop Codex after its tasks finish; retry again. Confirm the URL and thread ID stay the same, the draft returns, and it waits for a manual send.
7. On a separate conflict fixture, click “在网页接续（保留原对话）”. Confirm one fork is created, the button is disabled during creation, and the original remains unchanged.
8. Confirm the fork has a distinct “· 网页接续” title, original history, working directory and project membership. Confirm the rejected draft and attachments return to the composer after route synchronization finishes.
9. Send manually. Confirm the request targets the chosen original/fork, with no automatic submission.
10. Simulate an HTML 502 response. Confirm a readable connection warning replaces the HTML and no write is automatically retried.
11. Complete a web turn (including a failed turn), then verify the server gracefully unsubscribes only its own inactive writer and waits for `thread/closed` before confirming release. Native `systemError` is inactive; `active` and `notLoaded` must never be released. Confirm a second app-server can resume the same ID immediately after release.
12. Navigate away from a resumed idle conversation. Confirm release is requested, while navigating away from an active turn never stops that turn.

Expected: only a specific active-writer resume conflict falls back once to thread/read with includeTurns. Other failures remain errors. Internal RPC rejections use HTTP 200 JSON error envelopes; authentication failures keep their HTTP status. A continuation is an explicit independent fork, not a writer-lock takeover or ongoing synchronization of two copies.

Performance: history browsing remains one request, using read instead of resume. Resume requests coalesce only while in flight, avoiding stale read-only results after ownership changes. An inactive web writer takes one metadata-only read plus one unsubscribe and an event-driven close wait (bounded to 12 seconds, always cleaned up). The web app-server alone overrides `thread_unload_delay_secs=0`, avoiding the native default 60-second retention; global desktop configuration is unchanged. Ownership mutations and sends serialize per thread, with no cross-thread blocking, history polling or fanout. The next send resumes an unloaded session. A known thread-not-found rejection can resume once before creating a turn; ambiguous transport errors never auto-resend. Full histories and attachments are not duplicated by cleanup. Explicit fork cost is unchanged.

Automation:

- `node node_modules/vitest/vitest.mjs run src/server/threadWriterLifecycle.test.ts src/server/appServerRuntimeConfig.test.ts src/api/codexRpcClient.test.ts src/api/codexGateway.test.ts src/composables/useDesktopState.test.ts`
- `node node_modules/vitest/vitest.mjs run src/server/codexAppServerBridge.archive.test.ts -t callRpcWithArchiveRecovery`
- `node scripts/test-rpc-error-http.cjs` after building the CLI; uses isolated CODEX_HOME, two real app-server processes on 4197/4198, and a localhost-only synthetic provider on 4199. It runs a failed fixture turn without any real model/account request, tests original-ID handoff and automatic completion cleanup, and reports handoff duration.
- `node scripts/test-writer-conflict.cjs` and `node scripts/test-writer-continuation-app.cjs` against a disposable Vite server (`WRITER_TEST_URL`). Both intercept API traffic or use synthetic messages and never contact a model. Cover 375×812 and 768×1024, light/dark, and complete route/draft/send flow.
- `node scripts/test-writer-original-retry-app.cjs` with `WRITER_TEST_URL` and optional `WRITER_SCREENSHOT_DIR`; four full-app combinations of the same viewports/themes, reader-only opening, failed/successful retry, original ID, draft restoration and manual send. All API requests are intercepted.

Limits: a desktop app-server can retain an idle writer even when its UI is elsewhere. The web cannot release an external writer automatically. Never delete its lock or kill the desktop process to suppress a real conflict. The original-retry button does not override ownership; the independent-fork option remains available. Docker provider/auth scenarios require Docker; on a Windows host without it, report that matrix as unrun and use the isolated native integration as a distinct validation.

Cleanup: no conversation deletion needed. Roll back the web release to restore prior behavior if necessary.
