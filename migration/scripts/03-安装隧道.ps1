$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw '请以管理员身份打开 Windows PowerShell，再运行本脚本。' }
if (Get-Service -Name cloudflared -ErrorAction SilentlyContinue) { throw '本机已有 cloudflared 服务。为避免影响其他站点，脚本停止安装；先核对已有服务。' }
$bundle = Split-Path -Parent $PSScriptRoot
$root = 'C:\Tools\codex-web-tunnel'
if (Test-Path -LiteralPath $root) { throw ('安装目录已存在，请核对后选择处理：' + $root) }
$tokenSource = Join-Path $bundle 'private\tunnel-token.txt'
if (-not (Test-Path -LiteralPath $tokenSource)) { throw '缺少隧道 Token，见完整迁移步骤。' }
New-Item -ItemType Directory -Path $root | Out-Null
$exe = Join-Path $root 'cloudflared.exe'
$tokenFile = Join-Path $root 'tunnel-token.txt'
Copy-Item -LiteralPath (Join-Path $bundle 'program\cloudflared.exe') -Destination $exe
Copy-Item -LiteralPath $tokenSource -Destination $tokenFile
# Service runs as LocalSystem. Keep the credential readable only by administrators and SYSTEM.
& icacls.exe $tokenFile /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw '令牌文件权限设置失败，未创建服务。' }
$binary = '"' + $exe + '" --no-autoupdate tunnel run --token-file "' + $tokenFile + '"'
New-Service -Name cloudflared -BinaryPathName $binary -DisplayName 'Codex Web Cloudflare Tunnel' -StartupType Manual -Description 'your configured hostname tunnel; stop old host connector before starting.' | Out-Null
& sc.exe failure cloudflared reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Warning '恢复策略未设置成功，可在 Windows 服务属性中手动设置。' }
Write-Host '隧道服务已安装，尚未启动。先验证新机本地网页，再停止旧机连接器，然后运行 04。' -ForegroundColor Green
Read-Host '按回车关闭'
