$ErrorActionPreference = 'Stop'
$bundle = Split-Path -Parent $PSScriptRoot
Write-Host 'Codex Web 迁移前检查（不会安装、修改配置或启动隧道）' -ForegroundColor Cyan
Write-Host ('当前用户目录：' + $env:USERPROFILE)
Write-Host ('系统：' + [Environment]::OSVersion.VersionString)
Write-Host ('64 位系统：' + [Environment]::Is64BitOperatingSystem)
$cli = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
$installed = @(Get-ChildItem -LiteralPath $cli -Filter codex.exe -Recurse -ErrorAction SilentlyContinue)
Write-Host ('已检测到 Codex CLI：' + ($installed.Count -gt 0))
$framework = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -ErrorAction SilentlyContinue
Write-Host ('.NET Framework 4.8 或更新：' + ($framework -and $framework.Release -ge 528040))
Write-Host ('已存在 .codex 数据：' + (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.codex')))
$docs = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Codex'
Write-Host ('项目恢复目标：' + $docs)
Write-Host ('项目目标已存在：' + (Test-Path -LiteralPath $docs))
Write-Host ('已有 cloudflared 服务：' + [bool](Get-Service -Name cloudflared -ErrorAction SilentlyContinue))
Write-Host ('18923 端口已被占用：' + [bool](Get-NetTCPConnection -State Listen -LocalPort 18923 -ErrorAction SilentlyContinue))
Write-Host '必须在新主机安装并登录 Codex，同一 Windows 用户下操作。先不要启动隧道。'
Read-Host '按回车关闭'
