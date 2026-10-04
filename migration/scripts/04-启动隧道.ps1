$ErrorActionPreference = 'Stop'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw '需要管理员 PowerShell。' }
$service = Get-CimInstance Win32_Service -Filter "Name='cloudflared'"
if (-not $service -or -not $service.PathName.StartsWith('"C:\Tools\codex-web-tunnel\cloudflared.exe"',[StringComparison]::OrdinalIgnoreCase)) { throw '未找到由 03 脚本安装的隧道服务，停止操作。' }
Write-Host '请确认：旧主机 cloudflared 已停止，新机 127.0.0.1:18923 已可登录并打开历史对话。' -ForegroundColor Yellow
if ((Read-Host '输入 START 才会开始正式切换') -cne 'START') { Write-Host '没有启动隧道。'; exit 0 }
Set-Service -Name cloudflared -StartupType Automatic
Start-Service -Name cloudflared
Write-Host '连接器进程已启动；还需在 Cloudflare 控制台确认 Healthy，并用手机验证 your configured hostname。' -ForegroundColor Green
Read-Host '按回车关闭'
