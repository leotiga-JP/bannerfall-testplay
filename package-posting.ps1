param(
    [Parameter(Mandatory = $true)]
    [uri]$ServerUrl
)

$ErrorActionPreference = 'Stop'

if (-not $ServerUrl.IsAbsoluteUri -or $ServerUrl.Scheme -ne 'https' -or
    -not $ServerUrl.Host.EndsWith('.onrender.com', [StringComparison]::OrdinalIgnoreCase) -or
    $ServerUrl.AbsolutePath -ne '/' -or $ServerUrl.Query -or $ServerUrl.Fragment -or
    $ServerUrl.UserInfo -or -not $ServerUrl.IsDefaultPort) {
    throw 'Use the HTTPS service URL from Render, e.g. https://your-service.onrender.com'
}

Push-Location -LiteralPath $PSScriptRoot
try {
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

    $dist = Join-Path $PSScriptRoot 'dist'
    $zip = Join-Path $PSScriptRoot 'bannerfall-posting.zip'
    $config = @{ serverUrl = "wss://$($ServerUrl.Host)/ws" } | ConvertTo-Json
    [System.IO.File]::WriteAllText((Join-Path $dist 'server-config.json'), $config)
    Compress-Archive -Path (Join-Path $dist '*') -DestinationPath $zip -Force
    Write-Output $zip
} finally {
    Pop-Location
}
