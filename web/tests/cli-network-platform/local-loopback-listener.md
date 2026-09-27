# Local loopback listener

## Prerequisites

- Build the frontend and CLI, and provide an authenticated Codex executable.
- Use an available local port such as 18923.

## Actions

1. Run the CLI with `--host 127.0.0.1 --port 18923 --no-tunnel --no-open --no-login`.
2. Inspect the listening socket and request the local homepage.
3. Check startup output and request the API with a non-local Host header, without a login cookie.
4. Stop the process, then verify its listener is gone.

## Expected results

- Only `127.0.0.1` listens; no wildcard or LAN listener is created.
- The local homepage loads, startup reports the same address, and no LAN URL is advertised.
- A non-local Host request still requires the existing password authentication.
- `--host` only changes the listener address and advertised URLs; request handlers and Codex execution are unchanged.

## Cleanup

Stop only the test CLI process. The host option defaults to loopback; deployments that intentionally need LAN access can explicitly pass `--host 0.0.0.0`.

## Local verification and performance

Verified on Windows with Node 24.19.0 and the packaged CLI: the listener bound only to `127.0.0.1:18923`; password checks for a non-local Host, a real file read/write task, disconnected task completion, and browser message submission passed. Stopping and restarting through the local controller took 5.6 seconds in total.

The host option passes one string to the existing listener and avoids LAN-interface enumeration when bound to loopback. It adds no requests, blocking filesystem work, fanout, payloads, or cache invalidation. Frontend build output was 522.70 kB for the main JavaScript chunk (161.10 kB gzip); frontend code was unchanged. Type checking, frontend/CLI builds, the CJS CLI-help smoke check, and 10 runtime/terminal tests passed. A comparative CPU or network profile was not collected.
