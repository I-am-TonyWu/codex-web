param([switch]$Repack, [switch]$Test)
$ErrorActionPreference = 'Stop'
$sourceRoot = $PSScriptRoot
$outputRoot = Join-Path (Split-Path $sourceRoot -Parent) 'artifacts'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$references = @('/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:System.Security.dll')
$sources = @('Monitor.cs','Runtime.cs','TrayApp.cs','SecuritySettings.cs','CloudflareSite.cs') | ForEach-Object { Join-Path $sourceRoot $_ }
if ($Test) {
    foreach ($name in @('MonitorTests','SecurityTests')) {
        & $compiler /nologo /target:exe /platform:x64 "/main:CodexWebTray.$name" "/out:$outputRoot\$name.exe" @references @sources "$sourceRoot\$name.cs"
        if ($LASTEXITCODE -ne 0) { throw "$name compilation failed" }
        & "$outputRoot\$name.exe"
        if ($LASTEXITCODE -ne 0) { throw "$name failed" }
    }
}
& $compiler /nologo /target:exe /platform:x64 /main:CodexWebTray.BuildAssets "/out:$outputRoot\BuildAssets.exe" @references @sources "$sourceRoot\BuildAssets.cs"
if ($LASTEXITCODE -ne 0) { throw 'Icon build failed' }
& "$outputRoot\BuildAssets.exe" $outputRoot
$archive = Join-Path $outputRoot 'payload.zip'
if ($Repack -and (Test-Path $archive)) { Remove-Item -LiteralPath $archive }
if (-not (Test-Path $archive)) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory("$sourceRoot\payload", $archive, [IO.Compression.CompressionLevel]::Optimal, $false)
}
$hash = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$outputRoot\payload.id",$hash.Substring(0,16))
& $compiler /nologo /target:winexe /platform:x64 /optimize+ "/out:$outputRoot\CodexWebTray.exe" "/win32icon:$outputRoot\app.ico" "/win32manifest:$sourceRoot\app.manifest" "/resource:$archive,payload.zip" "/resource:$outputRoot\payload.id,payload.id" "/resource:$sourceRoot\github-mark.png,github-mark.png" @references @sources
if ($LASTEXITCODE -ne 0) { throw 'Tray build failed' }
Get-FileHash "$outputRoot\CodexWebTray.exe" -Algorithm SHA256
