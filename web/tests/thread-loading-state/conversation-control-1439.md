# Desktop coordination, 1.4.3.9 preview

Prerequisites: Windows Codex running under the same user, compatible desktop IPC stream v11, authenticated web access. Keep a disposable historical conversation idle in the desktop backend. Use two browser tabs; repeat at 375×812 and 768×1024 in light/dark themes.

1. Open the original historical ID in the web. Type a draft without sending. Click recheck. Expect the same ID and history, a desktop coordination label, and no new turn or branch.
2. Send manually. Expect one turn in the original conversation; desktop and web display the result. Check files, selected model/effort, attachments, skill/plugin references and workspace sandbox/approval behavior.
3. During a task or pending approval, try another send. It must be rejected before native submission, with the draft retained. Take control in tab B; late sends/stops/approvals from A must fail. B can respond to supported approvals or explicitly stop with the expected turn ID.
4. Disconnect the native IPC connection after submission. Expect unknown/unconfirmed state and no automatic resend. Recheck explicitly, inspect history and resolve the delivery marker before a new manual send.
5. Exit web control while idle. It cancels the subscription, keeps the desktop writer and history, and does not archive/stop the conversation. Reopen and recheck to reconnect.
6. Simulate a stream version mismatch or revision gap. Expect refusal, preserved draft and a recoverable read-only/retry path. There must be no forced process termination or lock deletion.

Cleanup/rollback: finish or explicitly stop the disposable task; clear test queues only after checking history. Exit the tray before restoring a previous EXE. Preserve current encrypted credentials. Desktop queue management and complete desktop preemption are not implemented; do not test simultaneous desktop queue manipulation as a guaranteed supported flow.

Automated evidence: 128 related unit tests, 7 bridge tests, 12 responsive/theme UI scenarios, a real isolated app-server with an IPC fixture and local-only provider, and read-only discovery of the installed desktop. The fixture is not a real desktop model round trip. Actual desktop send/reply, physical mobile and Windows reboot still need acceptance.
