$ErrorActionPreference = 'Stop'
$bundle = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $bundle 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($env:COMPUTERNAME -ne $manifest.oldComputerName -or $env:USERPROFILE -ne $manifest.oldProfile) { throw '此脚本仅用于原主机更新迁移快照。' }
if (@(Get-Process -Name Codex,ChatGPT,CodexWebTray -ErrorAction SilentlyContinue).Count) { throw '请彻底退出旧机 Codex 和托盘后再运行；不会自动关闭它们。' }
$python = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw '未找到旧主机 Codex Python 运行时。可安装 Python 3.12 后手动运行 scripts/export-data.py --zip。' }
& $python (Join-Path $PSScriptRoot 'export-data.py') --zip
if ($LASTEXITCODE -ne 0) { throw '重新导出失败；请看上方错误，勿使用未完成的 ZIP。' }
Write-Host '备份、校验表与同名 ZIP 已更新。请重新复制迁移包至新主机。' -ForegroundColor Green
Write-Host 'private 凭据文件不会重新读取；若导出后改过密码或 Token，请手动更新 private 文件。'
Read-Host '按回车关闭'
