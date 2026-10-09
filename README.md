# codex-web

[English](README.en.md) · **中文**

把 Windows 电脑中运行的 Codex 工作环境带到浏览器：本机运行服务，手机或其他电脑通过网页访问。提供 Windows 系统托盘程序，支持自动跟随 Codex 启停、网页密码、技能与插件选择、上传进度和生成文件访问。

基于 [friuns2/codex-mobile](https://github.com/friuns2/codex-mobile) **v0.1.91** 定制，首个公开发行版为 **1.4.3.1**。这是社区项目，与 OpenAI、GitHub、Cloudflare 没有官方隶属关系。不是普通 ChatGPT 网页的镜像，不提供 ChatGPT 聊天权益转发。

当前稳定版：**1.4.3.6**。详见[更新说明](docs/releases/1.4.3.6.md)。[全部历史版本与切换方法](docs/RELEASES.md) · [GitHub 全部 Releases](https://github.com/I-am-TonyWu/codex-web/releases)。

## 下载和系统要求

本次版本相较上次公开版的[完整更新说明](docs/releases/1.4.3.6.md)；跨主机搬迁见[迁移工具和步骤](migration/README.md)。Windows 沙箱问题见[沙箱修复说明](docs/WINDOWS-SANDBOX.md)。

- [下载 Windows x64 托盘程序](https://github.com/I-am-TonyWu/codex-web/releases/latest)。下载 `CodexWebTray.exe`，不要把 GitHub 自动生成的 Source code 压缩包当作安装程序。
- Windows 10/11 x64、.NET Framework 4.8；需要已安装、登录并能正常工作的 Codex Windows 桌面客户端。
- 发布 EXE 内置 Node.js 和网页运行文件，无需单独安装 Node.js。**不包含 Codex 客户端、账号、Token、密码或个人工作目录。**
- 主机必须能访问 Codex 所需的网络服务。远端通过自建网页连接主机，无需在远端安装 Codex；公司网络仍可能阻止自建域名或相关连接。
- 程序未进行代码签名。请从本仓库 Releases 下载，并核对 `SHA256SUMS.txt`；遵守所在组织的软件使用要求。

## 本机快速开始

1. 在主机上打开 Codex，完成登录，确认桌面客户端能够正常使用。
2. 把 `CodexWebTray.exe` 放在固定目录，例如 `C:\Tools\codex-web\`，双击启动。开启自启后移动 EXE，应重新设置自启路径。
3. 在通知区域找到托盘图标；也可能在“显示隐藏的图标”里。右键选择 **设置**。
4. 在 **修改网页密码** 中设置自己的密码：8–20 个字符。首次启动会生成初始密码，通过设置窗口重设后使用即可，不需要查找初始密码。
5. 点击 **打开网页**，访问 `http://127.0.0.1:18923/`，使用网页密码登录。
6. 如需自动启动，勾选 **登录 Windows 后启动**。这是当前用户登录后自启，不是 Windows 登录前运行的系统服务。

主机需要保持开机、已登录且不休眠；仅锁定屏幕与注销账户不同。程序每约 3 秒检测同一会话中的 Codex 客户端，检测到后启动网页服务。

| 托盘状态 | 含义 |
| --- | --- |
| 黄色 | 等待 Codex 桌面程序运行 |
| 绿色 | Codex 已运行，网页服务正常 |
| 红色 | Codex 已运行，网页服务启动或健康检查失败 |
| 灰色 | 已手动暂停网页服务 |

右键菜单包含当前状态、打开网页、设置和退出；启停服务、重启、自启、日志、密码和 Cloudflare 设置集中在设置窗口。

## 网页中的功能

- 新建和读取 Codex 工作任务；尝试与桌面任务列表同步。
- 支持桌面新版项目 ID、项目名称、排列顺序、空项目和对话归属；页面可见时约每 5 秒同步一次，恢复前台时也会刷新。项目目录与历史任务的执行目录分别保留。ChatGPT 云聊天项目不属于本地工作接口。
- 对话右键或点击省略号 → **项目**，选择本地项目；支持换项目和移回**无项目（普通聊天）**。可搜索项目，当前归属有勾选标记；保存期间禁止重复操作，失败保留原归属。只改聊天归属，不移动项目文件或更改工作目录。
- 根据模型支持的参数提供推理强度选项，避免显示不支持的强度。
- 改善长对话的历史加载和滚动。
- Mermaid 流程图直接绘制，支持明暗主题、查看代码和放大预览；渲染库随程序打包，无需外部 CDN。
- 上传文件时显示进度，上传期间锁定发送，失败可重试。
- 通过网页中的文件链接查看或下载主机生成的文件。能否预览取决于文件类型与浏览器。
- 读取桌面安装的技能和插件，选择后引用到任务；描述可展开，中文说明尽量展示，未翻译的内容保留原文。
- 页面可见时定期刷新扩展目录，隐藏时暂停；不同 Codex 版本的扩展兼容性可能不同。

该网页运行的是 Codex 工作任务，使用额度受账户和 Codex 服务规则约束；不是无限额度方案。

## 通过 Cloudflare 远程访问（可选）

建议使用 **Cloudflare Tunnel + Access**，同时保留网页密码。公网访问意味着通过认证的人可能操作主机上的文件和工具，只允许可信用户。所有登录邮箱共享同一主机 Codex 环境，**不是多租户隔离**。

### 1. 准备域名和 Tunnel

1. 将自己的域名托管到 Cloudflare，进入 Zero Trust 控制台。
2. 在网络中的 Tunnels/Connectors 页面创建 Cloudflared Tunnel，例如 `codex-home`。控制台名称可能变化。
3. 按控制台给出的 Windows 安装步骤在主机安装并运行 `cloudflared`。隧道 Token 属于秘密，不要提交到仓库。托盘程序本身不安装或管理 cloudflared。
4. 添加发布的应用路由：域名例如 `codex.example.com`，服务类型 `HTTP`，地址 `127.0.0.1:18923`。
5. 主机通过出站隧道连接 Cloudflare；远端可以使用 IPv4 访问域名，不需要依赖家中公网 IPv6 或开放路由器入站端口。

### 2. 先保护访问，再公开使用

1. 在 Access → Applications 创建 **Self-hosted** 应用，域名与上一步一致。
2. 配置邮箱一次性验证码（One-time PIN）登录方式。
3. 建立此应用专用的 **Allow** 策略，Include 条件选择 **Emails**，逐条填写完整邮箱；不要使用 Everyone/Bypass。
4. 设置会话有效期，例如 12 小时。确认 Access 的应用覆盖整个域名。
5. 用未登录的浏览器打开该域名，确认先出现 Access 验证，再进入网页密码登录。

相关官方说明：[Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) · [Self-hosted Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)。

### 3. 让托盘管理允许邮箱（可选）

不配置本节也可以正常使用网页和 Tunnel；邮箱仍可在 Cloudflare 控制台管理。

1. 在托盘 **设置 → Cloudflare 站点** 填写：
   - **Account ID**：Cloudflare 账户 ID，32 位十六进制字符串。
   - **Application ID**：所创建的 Access 应用 ID，可从应用编辑页地址或 API 获得。
   - **Policy ID**：关联到此应用的 Allow 策略 ID，可从策略编辑页或 API 获得；不要填写 Tunnel ID。
   - **域名**：例如 `codex.example.com`，不含 `https://` 或路径。
2. 在 Cloudflare 个人资料 → API Tokens 创建自定义 Token，赋予该账户的 **Access: Apps and Policies / Edit（Write）** 权限。不要使用 Global API Key 或 Tunnel Token。
3. 将新 Token 复制到托盘 **Access 登录** 窗口，勾选 **用 Windows 当前账户加密保存令牌**，点击 **连接并读取**。
4. 连接成功会保存 Token 并显示邮箱。Token 原文通常只在 Cloudflare 创建时展示一次；不要把它放进 GitHub 或截图。
5. 修改邮箱（每行一个）或策略有效期后，点击 **保存到 Cloudflare**，检查确认提示。程序会重新读取验证，并拒绝覆盖共享策略、复杂非邮箱规则或已被其他人修改的配置。

移除邮箱不等于立即撤销旧会话；如需立即取消已登录者的访问，请在 Cloudflare 控制台撤销对应会话。修改这里的有效期主要影响新会话。

### 4. Token 保存与重启

1.4.3.1 使用 Windows 当前用户 DPAPI 加密，将 Access Token 存在当前用户注册表，并保留加密文件。请在**实际桌面登录账户启动的托盘窗口**中填写和保存，随后退出再手动启动验证，再验证 Windows 重启。

开发或自动化工具的隔离环境可能看到不同的文件/注册表。仅在隔离工具中测试成功，不证明桌面自启可读取。跨账户复制密文不可直接使用；换机器/账户后请重新配置。已有环境发生过隔离工具与自启进程存储视图不一致，公开包没有替每位用户验证 Windows 重启。

## 配置与数据

| 位置 | 内容 |
| --- | --- |
| `%LOCALAPPDATA%\CodexWebTray\cloudflare-site.json` | 用户配置的站点和资源 ID；不含 Token |
| `%LOCALAPPDATA%\CodexWebTray\secrets` | 当前用户加密的网页密码、Token |
| `HKCU\Software\CodexWebTray\Secrets` | 当前用户加密的 Access Token |
| `%LOCALAPPDATA%\CodexWebTray\logs` | 托盘和网页服务日志 |
| `%LOCALAPPDATA%\CodexWebTray\releases` | 从 EXE 解压的网页运行包 |
| `%LOCALAPPDATA%\CodexWebTray\workspace` | 默认工作目录 |
| `%USERPROFILE%\.codex` | 复用的 Codex 配置和任务数据；不包含在发行包中 |

## 常见问题

- **黄色图标**：启动并登录 Codex 桌面客户端，等待一个检测周期。
- **红色图标 / 502**：检查主机没有休眠、Codex 正在运行；先确认本机 18923 网页可打开，再检查 Tunnel 状态和路由。设置中可查看日志或重启服务。
- **Token 未配置**：在实际自启程序的窗口保存 Token；如果只有开发工具启动的实例能读取，检查运行账户和隔离环境，不要反复覆盖安装包。
- **Token 读取失败**：检查 Windows 用户身份、加密数据和权限；不要把错误当成“Token 已失效”。API 401/403 则需检查云端 Token 状态与权限。
- **端口占用**：退出旧版托盘或重复网页服务。程序不会主动杀死不属于它的进程。
- **技能/插件缺失或同步不及时**：先检查桌面端安装状态、当前任务工作目录和客户端版本，再刷新网页。不能保证所有未来桌面版本均兼容。
- **普通 ChatGPT 聊天**：不支持。PhantomStream、浏览器转发和 1.4.4 浏览器实验不在本版本中。

## 从源码构建

需要 Windows x64、Node.js 24 x64（含 npm）、Git 和 .NET Framework 4.x 编译器。运行目录不要使用已有部署的 `releases`。

```powershell
git clone https://github.com/I-am-TonyWu/codex-web.git
cd codex-web/web
npm ci
npm run build
cd ../tray
node package.cjs
./build.ps1 -Repack -Test
```

输出为 `artifacts/CodexWebTray.exe`。`package.cjs` 会打包当前 Node 可执行文件，因此必须使用 Windows x64 的 Node；它拒绝覆盖已有 `tray/payload`，重复构建前请将该生成目录移走或删除。`build.ps1 -Test` 执行监控和安全设置测试。

网页单独开发：在 `web/` 下执行 `npm run dev -- --host 127.0.0.1 --port 4173`（若开发包装脚本不转发参数，可直接运行 `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173`）。发布包的正式服务端口是 18923；开发服务器不是正式部署方式。

## 维护与升级

本项目已移除上游自动更新，避免覆盖定制功能。升级时退出托盘、备份旧 EXE、替换为新版本再启动；不要删除用户配置和 `.codex` 数据。上游改进需要人工合并、测试后发布。

源码布局：`web/` 为 Vue/TypeScript 网页及服务端；`tray/` 为 C# WinForms 启动器、设置和打包脚本；`docs/` 为发行说明。

## 许可证与致谢

[MIT](LICENSE)。保留原项目作者 Pavel Voronin、Igor Levochkin 的版权声明；本仓库 Windows 托盘和定制修改由 I-am-TonyWu 项目维护。Node.js 及依赖许可证随运行包保留，GitHub 图标用于链接上游，不表示认可。详见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)。
