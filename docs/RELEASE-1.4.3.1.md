# 1.4.3.1 — 首个公开版本 / First public release

## 中文

- Windows x64 托盘启动器，约 3 秒检测 Codex，颜色显示服务状态，支持启停、重启和登录后自启。
- 网页密码管理，8–20 个字符；Cloudflare Access 邮箱策略管理。
- Token 使用当前用户 DPAPI 加密，注册表持久化和旧文件迁移，读取错误不再统一显示“未配置”。
- 公开发行包移除开发者的域名和 Cloudflare 资源 ID，新增本机“Cloudflare 站点”配置。
- 保留定制网页的模型强度筛选、上传进度、长对话改进、文件链接和技能/插件菜单。
- 不包含 1.4.4 ChatGPT 浏览器实验、PhantomStream 或上游自动更新。

这是从 1.4.3.1 源码重新构建的通用公开包，不是包含开发者站点信息的旧 EXE 的逐字节副本。仅发布到 GitHub；不会自动替换现有主机安装。

已知限制：Windows 重启后的令牌读取与实际登录账户及隔离环境有关，发布前的进程重启测试不能代替每台机器的真实重启测试。Cloudflare Tunnel 需单独安装配置；多个邮箱共享同一主机环境；程序未签名。详见 README。

## English

- Windows x64 tray launcher with approximately 3-second Codex detection, colored status, start/stop/restart, and login startup.
- Web password management (8–20 characters) and Cloudflare Access email policy management.
- Current-user DPAPI encryption, persistent HKCU token storage, migration from the previous encrypted file, and distinct read-error messages.
- The public build removes developer-specific domain/resource IDs and adds local Cloudflare site configuration.
- Customized web model-effort filtering, upload progress, long-history improvements, file links, and skill/plugin menus.
- No 1.4.4 ChatGPT browser experiment, PhantomStream, or upstream auto-updater.

This is a generic public rebuild of the 1.4.3.1 source, not a byte-identical copy of the developer-specific EXE. Publishing it does not replace an existing local installation.

Known limitations: token persistence after reboot depends on the actual Windows identity and environment; process-restart tests do not replace per-machine reboot tests. Install/configure Cloudflare Tunnel separately. Allowed users share a single host environment. The binary is unsigned. See the README for details.
