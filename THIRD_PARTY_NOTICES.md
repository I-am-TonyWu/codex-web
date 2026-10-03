# Third-party notices

- **codex-mobile v0.1.91** — https://github.com/friuns2/codex-mobile — MIT. Original copyright: 2026 Pavel Voronin, Igor Levochkin. The customized source is under `web/`; the upstream license is retained at `web/LICENSE` and the repository root. The local source snapshot is based on commit `742e125` in the customized development checkout; this is not asserted to be an upstream release commit.
- **Node.js** — https://nodejs.org/ — Node's license and bundled third-party notices are included as `tray/NODE-LICENSE.txt` and copied into the embedded runtime.
- **Runtime npm dependencies** — express, commander, ws, qrcode-terminal, node-pty, and transitive dependencies retain their original license files in the embedded runtime's `app/node_modules`. Versions are recorded in `web/package-lock.json`.
- **Mermaid 11.15.0** — https://github.com/mermaid-js/mermaid — MIT. The frontend uses bundled, lazy-loaded Mermaid assets. License files and version/license metadata for Mermaid and its dependency tree (including DOMPurify) are collected into `app/dist/third-party` when building the frontend.
- **GitHub mark** — https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png — used as a link to the upstream GitHub project. This use does not imply endorsement. GitHub trademarks are not licensed by this project's MIT license.
- **Codex/OpenAI** — not bundled. Users install the official application separately and remain subject to the applicable service and usage terms.

Public release binaries contain no developer accounts, Cloudflare credentials, browser profiles, or Codex history. Configuration is provided by each user after installation.
