# 迁移工具 / Migration tools

这些脚本供个人迁移包使用，公开源码不包含任何人的聊天、项目、令牌或清单。完整迁移包应放在公开仓库之外。源主机和目标主机需要 Windows x64；迁移不会复制 Codex 登录权益，需在新主机安装并重新登录 Codex。

私人迁移目录结构：`program/`（EXE 和 cloudflared）、`runtime/node.exe`、`source/`、`scripts/`、`private/`（本人私有凭据）、`backup/`、`manifest.json`、完整操作手册和校验表。

清单应记录真实的 `oldProfile`、`oldCodexHome`、`oldDocumentsCodex`、`oldDocumentsRoot`、`oldLocalAppData`、`oldTrayWorkspace`、`oldComputerName`；`extraRoots` 格式为 `[{"source":"原项目绝对路径","backup":"extra-projects/0"}]`。`generatedExclusions` 可记录编译产物和旧备份的绝对目录，避免重复打包。请勿向仓库提交本人清单。外部磁盘项目路径需先规划目标映射，脚本会拒绝未映射的外部路径。

1. 旧主机退出 Codex 和托盘后，运行 `06-重新导出最新数据.ps1`。在线快照只能保证各数据库可读，最终切换前需要静止状态下导出。
2. 把完整私有包复制到新主机，运行 `05-校验迁移包.ps1` 和 `01-检查环境.ps1`。
3. 新机安装并登录 Codex，退出客户端，再运行 `02-恢复数据.ps1`。恢复保留旧目录，拒绝覆盖非空项目目录；现代项目 ID、聊天归属保留，`rootPaths`、会话 cwd 和数据库路径迁移到新用户及实际“文档”目录。历史消息正文不重写。
4. 启动 Codex 与托盘，在本人桌面窗口重新保存网页密码和 API Token；不要复制旧机 DPAPI 密文。先验证本地网页。
5. 新机 `03-安装隧道.ps1` 安装但不启动 Tunnel；停止旧机 Tunnel 后，在新机运行 `04-启动隧道.ps1`，最后验证手机访问及 Windows 重启。

两个主机不要同时用同一 Tunnel 提供不同数据。私人完整包可能含明文凭据和聊天，不能上传公开 GitHub。

## English

These tools support a **private**, owner-controlled migration folder; public source contains no user data, credentials, or personal manifest. Use Windows x64, install Codex and sign in again on the destination. Runtime dependencies belong under `runtime/`, software under `program/`, source under `source/`, scripts under `scripts/`, credentials under `private/`, and snapshots under `backup/`.

The manifest specifies the original profile, Codex home, Documents/Codex, actual Documents directory, LocalAppData, tray workspace and computer name. `extraRoots` maps each additional project directory to a subdirectory of the backup. `generatedExclusions` prevents old backup/build duplication. Paths on external drives need a planned target mapping; unmapped external roots are rejected.

Close Codex/tray on the source, re-export with script 06, transfer the private folder, then verify with scripts 05 and 01. Install and sign into Codex on the target, close it, and restore with script 02. Existing data is preserved instead of overwritten. Modern project IDs and memberships stay unchanged; root paths, session cwd, and SQLite paths are remapped, while message text remains intact. Save credentials under the new Windows user rather than copying DPAPI ciphertext. Verify localhost before staging Tunnel (03), stopping the old connector, and starting the new connector (04). Verify remote access and a real Windows restart.

An online snapshot is useful for inspection but a quiescent final export is required before cutover. Never publish the private package or run both connectors with divergent data.

Regression check: `node --disable-warning=ExperimentalWarning migration/test-restore.cjs` uses a disposable synthetic profile and database; it does not restore into the current user's profile.
