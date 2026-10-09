# codex-web

**English** · [简体中文](README.md)

A browser interface for the Codex environment running on your Windows computer, with a Windows system-tray launcher. Use it locally or connect remotely through an authenticated Cloudflare Tunnel. Includes lifecycle monitoring, web passwords, skill/plugin selection, upload progress, and access to generated files.

Customized from [friuns2/codex-mobile](https://github.com/friuns2/codex-mobile) **v0.1.91**. The first public release is **1.4.3.1**. This is an independent community project, not affiliated with OpenAI, GitHub, or Cloudflare. It does not mirror the ChatGPT website or forward subscription-based ChatGPT chats.

Current stable version: **1.4.3.6**. See the [release notes](docs/releases/1.4.3.6.md), [version history and switching guide](docs/RELEASES.md), and [all GitHub Releases](https://github.com/I-am-TonyWu/codex-web/releases).

## Download and requirements

Read the [changes since the last public release](docs/releases/1.4.3.6.md), [host migration guide](migration/README.md), and [Windows sandbox guidance](docs/WINDOWS-SANDBOX.md).

- [Download the Windows x64 release](https://github.com/I-am-TonyWu/codex-web/releases/latest). Choose `CodexWebTray.exe`, not GitHub's automatically generated source archive.
- Windows 10/11 x64 with .NET Framework 4.8 and a working, signed-in Codex Windows desktop installation.
- The EXE includes Node.js and the web runtime. **It does not include Codex itself, accounts, tokens, passwords, or personal workspaces.**
- The host must be able to reach the services required by Codex. Remote devices connect to your host's web interface and do not need Codex installed. Workplace networks may still restrict access to your domain.
- The binary is unsigned. Obtain it from this repository's Releases, verify `SHA256SUMS.txt`, and follow your organization's software rules.

## Local quick start

Desktop project synchronization supports modern project IDs, names, ordering, empty projects, and explicit thread membership. Visible pages check project metadata approximately every five seconds and refresh on foreground return. Project roots and historical thread working directories remain separate. ChatGPT cloud chat projects are outside the local work backend.

1. Open Codex on the host, sign in, and confirm it works.
2. Place `CodexWebTray.exe` in a permanent directory such as `C:\Tools\codex-web\` and run it. If you move it after enabling autostart, update autostart from Settings.
3. Find its notification-area icon (possibly under hidden icons), right-click, and choose **设置 / Settings**. The current application UI is primarily Chinese.
4. Use **修改网页密码 / Change web password** to set an 8–20 character password. A password is generated on first launch; reset it here before logging in instead of searching for the generated value.
5. Select **打开网页 / Open web** and sign in at `http://127.0.0.1:18923/`.
6. Enable **登录 Windows 后启动 / Start after Windows sign-in** if desired. This is per-user startup after login, not a pre-login Windows service.

Keep the host powered on, signed in, and awake. Locking the screen is different from signing out. The tray checks for Codex in the same Windows session approximately every 3 seconds and starts the web service when it is available.

| Icon | Meaning |
| --- | --- |
| Yellow | Waiting for the Codex desktop process |
| Green | Codex is running and the web service is healthy |
| Red | Codex is running but startup or health checks failed |
| Gray | Web service manually paused |

The tray menu contains status, Open web, Settings, and Exit. Start/stop/restart, autostart, logs, passwords, and Cloudflare management are in Settings.

## Web features

- Right-click a chat or use its ellipsis menu → **Project** to assign it, switch projects, or return to **No project (ordinary chat)**. Search and current-membership checks are included; saves block duplicate clicks, and failures preserve the previous assignment. Chat contents, working directories, and project files stay unchanged.

- Create and read Codex work tasks, with desktop task synchronization support.
- Synchronize modern local project IDs, names, ordering, empty projects, and explicit conversation assignments. Visible pages refresh about every five seconds and on foreground return; historical execution directories remain distinct from project roots. ChatGPT cloud-chat projects are outside the local work backend.
- Filter reasoning-effort options using model capabilities.
- Improvements to long conversation loading and scrolling.
- Render Mermaid diagrams with light/dark themes, source toggling, and a full-size preview. Diagram assets are bundled locally, with no external CDN required.
- File-upload progress, sending locked during uploads, and retryable failures.
- Open or download generated host files through web links. Preview support depends on file type and browser.
- Discover installed desktop skills/plugins and reference them in tasks. Expand long descriptions; show available Chinese descriptions and retain original text where no translation exists.
- Periodically refresh extension lists while the page is visible; pause polling in the background.

Compatibility can change with Codex desktop releases. Work requests remain subject to Codex/account usage limits; this is not an unlimited-usage workaround.

## Remote access with Cloudflare (optional)

Use **Cloudflare Tunnel + Access**, retaining the application's web password. Authenticated users may operate the host's files and tools. Only admit trusted people: all allowed addresses share the host's Codex environment, **without tenant isolation**.

### 1. Domain and tunnel

1. Add your domain to Cloudflare and open its Zero Trust dashboard.
2. Create a Cloudflared Tunnel under Networks → Tunnels/Connectors, for example `codex-home`. Dashboard labels may change.
3. Follow Cloudflare's Windows connector installation instructions on the host. Keep the tunnel token private. The tray does not install or manage cloudflared.
4. Add a published application route: your hostname, e.g. `codex.example.com`, type `HTTP`, service `127.0.0.1:18923`.
5. The host establishes an outbound connection to Cloudflare. Remote clients can use IPv4 without relying on the host's public IPv6 address or opening inbound router ports.

### 2. Protect the application before using it publicly

1. Create an Access **Self-hosted** application covering the same hostname.
2. Enable the email **One-time PIN** login method.
3. Create an application-specific **Allow** policy using **Emails** with explicit addresses. Do not use Everyone/Bypass.
4. Choose a session duration, such as 12 hours, and ensure the entire hostname is covered.
5. Test in a signed-out browser: Access authentication should appear before the application's password login.

Official guides: [Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) · [Self-hosted Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/).

### 3. Manage allowed emails from the tray (optional)

This integration is not required to use the web service or Tunnel; you can manage Access entirely in Cloudflare.

1. Open **设置 → Cloudflare 站点 / Settings → Cloudflare site** and enter:
   - **Account ID**: the 32-character hexadecimal Cloudflare account ID.
   - **Application ID**: the Access application ID, available in its edit URL or through the API.
   - **Policy ID**: the ID of the Allow policy attached exclusively to this application. Obtain it from its edit page or API; it is not a Tunnel ID.
   - **Hostname**: e.g. `codex.example.com`, without scheme or path.
2. In Cloudflare's profile → API Tokens, create a custom token scoped to your account with **Access: Apps and Policies / Edit (Write)**. Do not use a Global API Key or Tunnel Token.
3. Open **Access 登录 / Access login**, paste the token, keep **用 Windows 当前账户加密保存令牌 / Encrypt and save for the current Windows user** checked, and select **连接并读取 / Connect and read**.
4. A successful connection stores the token and displays allowed emails. Cloudflare normally reveals the full token only when it is created. Never commit it or include it in screenshots.
5. Edit one email per line or the policy session duration, then choose **保存到 Cloudflare / Save to Cloudflare** and review the confirmation. The program reads back the result and refuses shared policies, complex non-email rules, or conflicting cloud changes.

Removing an email does not immediately revoke an existing session. Revoke sessions in Cloudflare when immediate removal is needed. Duration changes mainly affect new sessions.

### 4. Persistence and restarting

Version 1.4.3.1 encrypts the Access token with Windows DPAPI for the current user, persists it in HKCU, and maintains an encrypted file. Enter and save it in the tray launched under your **actual desktop login**, then exit/reopen and finally test a Windows restart.

Development/automation sandboxes may expose different file or registry views. Passing a test inside such a tool is not proof that the desktop autostart process can read the same data. Encrypted data is not portable across accounts/machines. A storage-view discrepancy was observed during development; the public package has not been reboot-tested on every environment.

## Data locations

| Location | Purpose |
| --- | --- |
| `%LOCALAPPDATA%\CodexWebTray\cloudflare-site.json` | User-configured site/resource IDs, no token |
| `%LOCALAPPDATA%\CodexWebTray\secrets` | User-encrypted web password and token files |
| `HKCU\Software\CodexWebTray\Secrets` | User-encrypted Access token |
| `%LOCALAPPDATA%\CodexWebTray\logs` | Tray/service logs |
| `%LOCALAPPDATA%\CodexWebTray\releases` | Extracted embedded runtime |
| `%LOCALAPPDATA%\CodexWebTray\workspace` | Default workspace |
| `%USERPROFILE%\.codex` | Reused Codex configuration/tasks; never included in releases |

## Troubleshooting

- **Yellow:** open and sign in to Codex; wait one detection cycle.
- **Red / 502:** check that the host is awake and Codex is running. Verify localhost port 18923 first, then the Tunnel and its route. Use Settings to view logs or restart the service.
- **Token not configured:** save it in the actual desktop/autostart instance. If only tool-launched instances see it, investigate identity and isolation rather than repeatedly replacing the EXE.
- **Token read error:** check Windows identity, permissions, and encrypted storage. An unreadable local token is different from an expired cloud token. API 401/403 requires checking Cloudflare token status and permissions.
- **Port occupied:** close the old tray or duplicate web service. The launcher does not kill unrelated processes.
- **Missing extensions or delayed sync:** check desktop installation, task working directory, and client version, then refresh. Future desktop versions may require compatibility updates.
- **Ordinary ChatGPT chats:** not supported. PhantomStream, message forwarding, and the 1.4.4 browser experiment are excluded.

## Build from source

Requires Windows x64, Node.js 24 x64 with npm, Git, and the .NET Framework 4.x C# compiler. Do not build inside an installed runtime's `releases` directory.

```powershell
git clone https://github.com/I-am-TonyWu/codex-web.git
cd codex-web/web
npm ci
npm run build
cd ../tray
node package.cjs
./build.ps1 -Repack -Test
```

The output is `artifacts/CodexWebTray.exe`. `package.cjs` bundles the Node executable used to run it, so use Windows x64 Node. It refuses to overwrite an existing `tray/payload`; remove or move that generated directory before repackaging. `build.ps1 -Test` runs monitor and security/settings tests.

For web development, run `npm run dev -- --host 127.0.0.1 --port 4173` in `web/`. If the wrapper does not forward arguments, use `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173`. The release service uses port 18923; the development server is not a deployment method.

## Maintenance

Upstream auto-updates are removed to protect local customizations. To upgrade, exit the tray, back up the EXE, replace it, and restart. Preserve user configuration and `.codex` data. Merge upstream changes manually and test before publishing.

Layout: `web/` contains the Vue/TypeScript UI and server, `tray/` contains the C# WinForms launcher/settings/build scripts, and `docs/` contains release notes.

## License and acknowledgments

[MIT](LICENSE). Original copyright notices for Pavel Voronin and Igor Levochkin are retained. Windows tray/customizations are maintained in the I-am-TonyWu project. Node.js and dependency licenses are included in the runtime. The GitHub mark links to the upstream project and implies no endorsement. See [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md).
