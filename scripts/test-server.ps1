# Builds this checkout and runs it as the test server, beside the live one: a port and a host
# directory of its own, so the two share no pairings, settings or log. The directory is the same
# from every worktree, so a phone paired with the test address stays paired. Open the port once
# with firewall.ps1 -Test. Ctrl+C stops the server.
param(
    [int]$Port = 8081
)

$ErrorActionPreference = 'Stop'
$liveDir = Join-Path $env:APPDATA 'StratChessUI'
$testDir = Join-Path $env:APPDATA 'StratChessUI-Test'
New-Item -ItemType Directory -Force $testDir | Out-Null

# Seeded once from the live engines; after that the test server's engines.json is its own.
$liveEngines = Join-Path $liveDir 'engines.json'
$testEngines = Join-Path $testDir 'engines.json'
if (-not (Test-Path $testEngines) -and (Test-Path $liveEngines)) {
    Copy-Item $liveEngines $testEngines
    # Relative paths in engines.json resolve against the file: the junction lets the copy's paths
    # reach the live downloads.
    $liveBinaries = Join-Path $liveDir 'engines'
    $testBinaries = Join-Path $testDir 'engines'
    if ((Test-Path $liveBinaries) -and -not (Test-Path $testBinaries)) {
        New-Item -ItemType Junction -Path $testBinaries -Target $liveBinaries | Out-Null
    }
    Write-Host "Seeded $testEngines from the live server's."
}

$env:STRATCHESS_UI_HOME = $testDir
$env:PORT = $Port
# The startup task's log belongs to the live server.
$env:LOG_FILE = $null

Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    npm start
} finally {
    Pop-Location
}
