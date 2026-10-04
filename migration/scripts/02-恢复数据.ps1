$ErrorActionPreference = 'Stop'
$bundle = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $bundle 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($env:COMPUTERNAME -eq $manifest.oldComputerName -and $env:USERPROFILE -eq $manifest.oldProfile) {
    throw '这是原主机。为避免覆盖正在使用的数据，恢复脚本只应在新主机运行。'
}
$running = @(Get-Process -Name Codex,ChatGPT,CodexWebTray -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) { throw '请先在新机彻底退出 Codex 与托盘程序（关闭窗口可能仍在后台运行），再恢复数据。' }
$cli = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
if (-not @(Get-ChildItem -LiteralPath $cli -Filter codex.exe -Recurse -ErrorAction SilentlyContinue).Count) { throw '请先在新机安装 Codex，登录一次后退出，再运行本脚本。' }
$docs = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Codex'
$workspace = Join-Path $env:LOCALAPPDATA 'CodexWebTray\workspace'
foreach ($target in @($docs,$workspace)) {
    if ((Test-Path -LiteralPath $target) -and @(Get-ChildItem -LiteralPath $target -Force).Count) { throw ('目标已有文件，脚本不会覆盖。请先手动移动到其他位置：' + $target) }
}
$node = Join-Path $bundle 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $node)) { throw '迁移包不完整，缺少 runtime/node.exe。' }
& (Join-Path $PSScriptRoot '05-校验迁移包.ps1') -NoPause
if ($LASTEXITCODE -ne 0) { throw '校验失败，未恢复。' }
Write-Host ('Codex 目标：' + (Join-Path $env:USERPROFILE '.codex'))
Write-Host ('项目目标：' + $docs)
Write-Host ('默认工作目录：' + $workspace)
Write-Host '现有 .codex 将改名保留，恢复不会合并已有项目目录。' -ForegroundColor Yellow
if ((Read-Host '输入 RESTORE 开始恢复') -cne 'RESTORE') { Write-Host '没有恢复或移动任何数据。'; exit 0 }
$codexRoot = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.codex'))
$expected = [IO.Path]::GetFullPath($env:USERPROFILE).TrimEnd('\') + '\'
if (-not $codexRoot.StartsWith($expected,[StringComparison]::OrdinalIgnoreCase)) { throw '恢复目标不在当前用户目录内。' }
$prior = $null
if (Test-Path -LiteralPath $codexRoot) {
    $prior = $codexRoot + '.before-codex-web-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Move-Item -LiteralPath $codexRoot -Destination $prior
    Write-Host ('新机原 .codex 已完整备份到：' + $prior)
}
try {
    & $node --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'restore-data.cjs') $env:USERPROFILE $env:LOCALAPPDATA $docs
    if ($LASTEXITCODE -ne 0) { throw '数据恢复失败。保留原目录备份与部分恢复数据，请不要启动 Codex，查看上方错误。' }
    if ($prior) {
        foreach ($name in @('auth.json','accounts.json','accounts','installation_id','cap_sid')) {
            $source = Join-Path $prior $name
            if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $codexRoot $name) -Recurse -Force }
        }
    }
} catch {
    Write-Warning '旧数据备份没有删除。失败时先保留现场，勿重复运行覆盖。'
    throw
}
Write-Host '恢复完成。接着打开 Codex，检查历史任务与项目；再启动 program/CodexWebTray.exe。' -ForegroundColor Green
Write-Host '网页密码与 API Token 请从 private 文件复制到本人桌面托盘窗口保存，不要复制旧 DPAPI 密文。'
Write-Host '已迁移的定时自动任务默认暂停，请在完成切换后检查并按需重新开启。'
Read-Host '按回车关闭'
