# Persistent Windows desktop/web tasks

Prerequisites: desktop and web service run under the same Windows user and CODEX_HOME. Keep desktop open. Use a disposable task, not a real user's active task.

1. Create a web task and send a short message. Expect thread/start to request ephemeral:false, historyMode:paginated and threadSource:user.
2. Verify the task appears in the desktop task listing, then read its turns through the desktop API. Expect the exact user message and final response, not just a sidebar title.
3. Restart the web service. Read the same thread from the webpage and refresh. Expect the response to persist. Switching back to a desktop-owned historical thread must retain the existing active-writer fallback.

Verified on 2026-09-25: thread `01a0d7bf-3868-7ce0-977e-5e6b69dc5004` returned WEB-SYNC-20260925-OK; the desktop list and read APIs both exposed it; the same reply survived tray restart. A second TestChat turn verified a real downloadable Windows file link and browser refresh persistence.

Limits: this does not test simultaneous editing of the same active turn on two devices, nor guarantee immediate sidebar refresh in every desktop app build. Do not restart the user's desktop during a running task merely to refresh its sidebar.

Performance audit: changes only three fields in the existing thread/start request. No extra polling, database mutation, filesystem scan, or new RPC is introduced. Cleanup: archive the test task when finished.
