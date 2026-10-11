# Account reload and login stability

Version: local 1.4.3.10.

1. With a logged-in Codex account, open Settings → Accounts and click Reload repeatedly. The active account remains selected and quota refresh completes without stopping the shared chat runtime.
2. Simulate an unavailable quota endpoint. The account remains logged in and keeps its previous quota snapshot; another Reload remains possible.
3. Return HTML HTTP 502/503/504 or an HTTP 200 JSON error envelope from an account endpoint. The page displays a readable error, preserves account cards and restores buttons. No raw HTML or JSON parser exception is shown.
4. Start Login and cancel the dialog. Its isolated temporary process stops, the directory is cleaned after `close`, and the working host login remains unchanged.
5. Submit a callback with the wrong port or OAuth state. It is rejected without contacting that address or overwriting the active login.
6. Try activating another login during an active task or approval. The account change is refused; account Reload remains usable.
7. Validate both an in-progress callback and a callback already completed on the host. Activation occurs after validation and successful state commit. A failed final commit restores the old login.
8. Make a provider change fail. The UI rechecks the configured provider and does not leave an uncommitted selection displayed.

Automated coverage: `src/server/accountRoutes.test.ts`, `src/server/accountProcess.test.ts`, `src/api/serviceJson.test.ts`, `src/server/desktopThreadBridge.test.ts`, and `scripts/test-account-settings-ui.cjs`. Run the UI fixture with a localhost Vite server on port 4195. Do not build or edit watched source files during the browser run.

Optional live read-only Windows verification: set `ACCOUNT_LIVE_CODEX_HOME` to the existing Codex home and `CODEXUI_CODEX_COMMAND` to the installed Codex executable, then run `src/server/accountProcess.windows.test.ts`. It only invokes `account/read` with `refreshToken: false`; it never sends a model request. Full OAuth enrollment requires an interactive user login.
