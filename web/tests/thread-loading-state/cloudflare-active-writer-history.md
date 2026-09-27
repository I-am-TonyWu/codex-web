# History loading through a reverse proxy with a desktop writer

Prerequisites: desktop Codex owns an existing thread; the web server uses the same CODEX_HOME; an authenticated browser accesses the web server through Cloudflare Access/Tunnel.

1. Open the desktop-owned conversation in the remote web UI.
2. Check POST /codex-api/rpc for thread/resume: it returns 200 with history, rather than an HTML 502 page.
3. Confirm the latest history is visible and desktop work continues without cancellation.
4. Open another, unowned conversation and confirm normal resume behavior.

Expected: only a specific active-writer resume conflict falls back once to thread/read with includeTurns. Other failures remain errors. Sending messages is not retried or transferred to another writer by this change.

Performance: normal resume remains one RPC; a conflict takes two local RPCs but one browser request. Existing response trimming and inline-payload sanitization remain in the HTTP pipeline. No new polling or caches.

Cleanup: no conversation deletion needed. Roll back the web release to restore prior behavior if necessary.
