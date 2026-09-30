# Bannerfall Launcher - Single Window Edition v2
# Robust server startup:
# - Runs npm inside a child PowerShell in the SAME console window
# - Sets PORT explicitly in that child process
# - Waits for /health before considering startup successful
# - DEV client starts only after DEV server health succeeds
# - "Stop all" terminates all process trees started by this launcher

$ErrorActionPreference = "Stop"

# =========================
# CONFIG
# =========================
$GitHubRoot = "C:\Users\leoti\ドキュメント\GitHub"

$DevRoot  = Join-Path $GitHubRoot "bannerfall-dev\bannerfall-testplay"
$ProdRoot = Join-Path $GitHubRoot "bannerfall-prod\bannerfall-testplay"

$DevPort  = 8788
$ProdPort = 8787

$ProdHttpsPort = 443
$DevHttpsPort  = 8443

$ServerStartupTimeoutSec = 20
# =========================

$script:Processes = @{}

function Test-CommandExists {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-TailscaleExe {
    $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $defaultPath = "C:\Program Files\Tailscale\tailscale.exe"
    if (Test-Path $defaultPath) { return $defaultPath }

    return $null
}

function Test-Project {
    param([string]$Root, [string]$Label)

    if (-not (Test-Path $Root)) {
        throw "$Label folder not found: $Root"
    }
    if (-not (Test-Path (Join-Path $Root "package.json"))) {
        throw "$Label package.json not found: $Root"
    }
    if (-not (Test-Path (Join-Path $Root "server\package.json"))) {
        throw "$Label server package.json not found: $Root\server"
    }
}

function Is-TrackedProcessRunning {
    param([string]$Name)

    if (-not $script:Processes.ContainsKey($Name)) { return $false }

    $p = $script:Processes[$Name]
    try {
        Get-Process -Id $p.Id -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        $script:Processes.Remove($Name)
        return $false
    }
}

function Start-ChildPowerShell {
    param(
        [string]$Name,
        [string]$ScriptText
    )

    if (Is-TrackedProcessRunning $Name) {
        Write-Host "$Name is already running." -ForegroundColor Yellow
        return $script:Processes[$Name]
    }

    # EncodedCommand avoids quoting problems with Japanese paths and npm commands.
    $bytes = [System.Text.Encoding]::Unicode.GetBytes($ScriptText)
    $encoded = [Convert]::ToBase64String($bytes)

    Write-Host ""
    Write-Host ">>> Starting $Name" -ForegroundColor Cyan

    $proc = Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encoded) `
        -NoNewWindow `
        -PassThru

    $script:Processes[$Name] = $proc
    Write-Host "$Name launcher PID=$($proc.Id)" -ForegroundColor DarkGray
    return $proc
}

function Wait-ServerHealth {
    param(
        [int]$Port,
        [string]$Label,
        [string]$ProcessName,
        [int]$TimeoutSec = 20
    )

    Write-Host "Waiting for $Label server /health on :$Port ..." -ForegroundColor Cyan

    $deadline = (Get-Date).AddSeconds($TimeoutSec)

    while ((Get-Date) -lt $deadline) {
        if (-not (Is-TrackedProcessRunning $ProcessName)) {
            Write-Host ""
            Write-Host "$Label server process exited before /health became available." -ForegroundColor Red
            Write-Host "Check the npm/server error printed above in this same window." -ForegroundColor Yellow
            return $false
        }

        try {
            $health = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2

            Write-Host ""
            Write-Host "[$Label SERVER READY] http://127.0.0.1:$Port/health" -ForegroundColor Green
            $health | ConvertTo-Json -Depth 6
            return $true
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    }

    Write-Host ""
    Write-Host "$Label server did not answer /health within $TimeoutSec seconds." -ForegroundColor Red
    Write-Host "Do not start another npm server manually yet; inspect the log above first." -ForegroundColor Yellow
    return $false
}

function Start-Server {
    param(
        [string]$Root,
        [int]$Port,
        [string]$Label,
        [string]$ProcessName
    )

    Test-Project $Root $Label

    if (Is-TrackedProcessRunning $ProcessName) {
        Write-Host "$ProcessName is already running." -ForegroundColor Yellow
        return (Wait-ServerHealth $Port $Label $ProcessName 5)
    }

    $serverDir = Join-Path $Root "server"

    # Literal single quotes in path are escaped for PowerShell.
    $safeDir = $serverDir.Replace("'", "''")

    $childScript = @"
`$Host.UI.RawUI.WindowTitle = 'Bannerfall $Label Server :$Port'
Set-Location -LiteralPath '$safeDir'
`$env:PORT = '$Port'
Write-Host ''
Write-Host '==================================================' -ForegroundColor DarkCyan
Write-Host ' Bannerfall $Label Server :$Port' -ForegroundColor Cyan
Write-Host ' Folder: $safeDir' -ForegroundColor DarkGray
Write-Host '==================================================' -ForegroundColor DarkCyan
Write-Host 'Running: npm run start' -ForegroundColor Green
npm run start
`$exitCode = `$LASTEXITCODE
Write-Host ''
Write-Host "npm run start exited with code `$exitCode" -ForegroundColor Red
exit `$exitCode
"@

    Start-ChildPowerShell -Name $ProcessName -ScriptText $childScript | Out-Null
    return (Wait-ServerHealth $Port $Label $ProcessName $ServerStartupTimeoutSec)
}

function Start-DevClient {
    Test-Project $DevRoot "DEV"

    $name = "DEV Client"
    if (Is-TrackedProcessRunning $name) {
        Write-Host "DEV Client is already running." -ForegroundColor Yellow
        return
    }

    $safeDir = $DevRoot.Replace("'", "''")

    $childScript = @"
`$Host.UI.RawUI.WindowTitle = 'Bannerfall DEV Client'
Set-Location -LiteralPath '$safeDir'
Write-Host ''
Write-Host '==================================================' -ForegroundColor DarkCyan
Write-Host ' Bannerfall DEV Client (Vite)' -ForegroundColor Cyan
Write-Host ' Browser opens automatically' -ForegroundColor Green
Write-Host '==================================================' -ForegroundColor DarkCyan
npm run dev -- --open
`$exitCode = `$LASTEXITCODE
Write-Host ''
Write-Host "Vite exited with code `$exitCode" -ForegroundColor Red
exit `$exitCode
"@

    Start-ChildPowerShell -Name $name -ScriptText $childScript | Out-Null
}

function Start-Dev {
    $ok = Start-Server `
        -Root $DevRoot `
        -Port $DevPort `
        -Label "DEV" `
        -ProcessName "DEV Server"

    if ($ok) {
        Start-DevClient
        Write-Host ""
        Write-Host "DEV startup complete." -ForegroundColor Green
        Write-Host "  Game server : http://127.0.0.1:$DevPort"
        Write-Host "  Vite        : browser opens automatically"
        Write-Host "  Funnel      : HTTPS port $DevHttpsPort"
    }
    else {
        Write-Host ""
        Write-Host "DEV Client was NOT started because the DEV server failed its health check." -ForegroundColor Red
    }
}

function Start-Prod {
    $ok = Start-Server `
        -Root $ProdRoot `
        -Port $ProdPort `
        -Label "PROD" `
        -ProcessName "PROD Server"

    if ($ok) {
        Write-Host ""
        Write-Host "PROD startup complete." -ForegroundColor Green
        Write-Host "  Game server : http://127.0.0.1:$ProdPort"
        Write-Host "  Client      : GitHub Pages"
        Write-Host "  Funnel      : HTTPS port $ProdHttpsPort"
    }

    return $ok
}

function Stop-TrackedProcess {
    param([string]$Name)

    if (-not $script:Processes.ContainsKey($Name)) { return }

    $p = $script:Processes[$Name]

    try {
        Get-Process -Id $p.Id -ErrorAction Stop | Out-Null
        Write-Host "Stopping $Name (PID=$($p.Id))..." -ForegroundColor Yellow

        # /T terminates npm/node descendants as well.
        & taskkill.exe /PID $p.Id /T /F 2>$null | Out-Null
    }
    catch {
        # Already stopped.
    }

    $script:Processes.Remove($Name)
}

function Stop-AllBannerfall {
    Write-Host ""
    Write-Host "Stopping all Bannerfall processes started by this launcher..." -ForegroundColor Yellow

    foreach ($name in @($script:Processes.Keys)) {
        Stop-TrackedProcess $name
    }

    Write-Host "All launcher-managed Bannerfall processes stopped." -ForegroundColor Green
}

function Show-ProcessStatus {
    Write-Host ""
    Write-Host "=== Bannerfall process status ===" -ForegroundColor Cyan

    foreach ($name in @("DEV Server", "DEV Client", "PROD Server")) {
        if (Is-TrackedProcessRunning $name) {
            $p = $script:Processes[$name]
            Write-Host ("{0,-14} RUNNING PID={1}" -f $name, $p.Id) -ForegroundColor Green
        }
        else {
            Write-Host ("{0,-14} STOPPED" -f $name) -ForegroundColor DarkGray
        }
    }
}

function Show-Health {
    Write-Host ""
    Write-Host "=== Local /health ===" -ForegroundColor Cyan

    foreach ($item in @(
        @{ Label = "PROD"; Port = $ProdPort },
        @{ Label = "DEV";  Port = $DevPort }
    )) {
        try {
            $health = Invoke-RestMethod "http://127.0.0.1:$($item.Port)/health" -TimeoutSec 2
            Write-Host "[$($item.Label)] OK :$($item.Port)" -ForegroundColor Green
            $health | ConvertTo-Json -Depth 5
        }
        catch {
            Write-Host "[$($item.Label)] NOT RESPONDING :$($item.Port)" -ForegroundColor DarkGray
        }
    }
}

function Show-TailscaleStatus {
    param([string]$TailscaleExe)

    Write-Host ""
    Write-Host "=== Tailscale ===" -ForegroundColor Cyan
    & $TailscaleExe status

    Write-Host ""
    Write-Host "=== Funnel ===" -ForegroundColor Cyan
    & $TailscaleExe funnel status
}

function Setup-TailscaleFunnel {
    param([string]$TailscaleExe)

    Write-Host ""
    Write-Host "PROD HTTPS $ProdHttpsPort -> localhost:$ProdPort"
    Write-Host "DEV  HTTPS $DevHttpsPort -> localhost:$DevPort"
    Write-Host ""

    $confirm = Read-Host "Set/re-set these persistent Funnel routes? (Y/N)"
    if ($confirm -notmatch '^[Yy]$') { return }

    & $TailscaleExe funnel --bg --https=$ProdHttpsPort $ProdPort
    & $TailscaleExe funnel --bg --https=$DevHttpsPort $DevPort

    Show-TailscaleStatus $TailscaleExe
}

# -------- prerequisites --------

$missing = @()

if (-not (Test-CommandExists "node")) { $missing += "node" }
if (-not (Test-CommandExists "npm"))  { $missing += "npm" }

$TailscaleExe = Get-TailscaleExe
if (-not $TailscaleExe) { $missing += "tailscale" }

if ($missing.Count -gt 0) {
    Write-Host "Missing command(s): $($missing -join ', ')" -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

try {
    while ($true) {
        Write-Host ""
        Write-Host "==================================================" -ForegroundColor DarkCyan
        Write-Host " BANNERFALL LAUNCHER - SINGLE WINDOW v2" -ForegroundColor Cyan
        Write-Host "==================================================" -ForegroundColor DarkCyan
        Write-Host ""
        Write-Host "1. DEV 起動       (:8788 + Vite + Browser)"
        Write-Host "2. PROD 起動      (:8787)"
        Write-Host "3. DEV + PROD 起動"
        Write-Host "4. 全て停止"
        Write-Host "5. プロセス / health 状態確認"
        Write-Host "6. Tailscale / Funnel 状態確認"
        Write-Host "7. Funnel 初期設定 / 再設定"
        Write-Host "8. 全て停止して終了"
        Write-Host ""

        $choice = Read-Host "番号を選択"

        switch ($choice) {
            "1" {
                Start-Dev
            }

            "2" {
                [void](Start-Prod)
            }

            "3" {
                $prodOK = Start-Prod
                Start-Sleep -Milliseconds 500
                Start-Dev
            }

            "4" {
                Stop-AllBannerfall
            }

            "5" {
                Show-ProcessStatus
                Show-Health
            }

            "6" {
                Show-TailscaleStatus $TailscaleExe
            }

            "7" {
                Setup-TailscaleFunnel $TailscaleExe
            }

            "8" {
                Stop-AllBannerfall
                break
            }

            default {
                Write-Host "1～8を選択してください。" -ForegroundColor Yellow
            }
        }

        if ($choice -eq "8") { break }
    }
}
finally {
    Stop-AllBannerfall
}
