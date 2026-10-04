param([switch]$NoPause)
$ErrorActionPreference = 'Stop'
$bundle = Split-Path -Parent $PSScriptRoot
$node = Join-Path $bundle 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $node)) { throw '迁移包不完整，缺少 runtime/node.exe。' }
# Use bundled Node for long paths; Windows PowerShell 5.1 Test-Path can misreport them as missing.
& $node (Join-Path $PSScriptRoot 'verify-bundle.cjs')
if ($LASTEXITCODE -ne 0) { throw '迁移包校验失败，请核对上方提示后重新复制文件。' }
if (-not $NoPause) { Read-Host '按回车关闭' }
$global:LASTEXITCODE = 0
