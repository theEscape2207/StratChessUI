# Registers a scheduled task that starts the server at boot, whether or not anyone is logged on,
# from this checkout. With no console, the server writes to server.log in the host directory,
# replaced at each start. Run from an elevated PowerShell after `npm run build`; run it again to
# change a setting. -Remove deletes the task again.
#Requires -RunAsAdministrator
param(
    [int]$Port = 8080,
    [string[]]$ExtraHosts = @(),
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$taskName = 'StratChessUI'

# Unregistering leaves a running instance running.
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $taskName
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}
if ($Remove) {
    Write-Host "Removed scheduled task $taskName."
    return
}

$checkout = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $checkout 'packages\client\dist\index.html'))) {
    throw "No client build in $checkout; run npm run build first."
}
if ($checkout -like '*\.claude\worktrees\*') {
    Write-Warning "$checkout is a worktree; the task stops working when it is removed."
}

# The server's own default, pinned: APPDATA may be unset for a task with nobody logged on.
$hostDir = if ($env:STRATCHESS_UI_HOME) { $env:STRATCHESS_UI_HOME } else { Join-Path $env:APPDATA 'StratChessUI' }
New-Item -ItemType Directory -Force $hostDir | Out-Null
$envFile = Join-Path $hostDir 'server.env'
$logFile = Join-Path $hostDir 'server.log'
# A task cannot set environment variables; node reads them from this file. WriteAllLines writes no
# BOM, which Windows PowerShell's Set-Content -Encoding utf8 would.
[IO.File]::WriteAllLines($envFile, [string[]]@(
    "STRATCHESS_UI_HOME=$hostDir",
    "LOG_FILE=$logFile",
    "PORT=$Port",
    "EXTRA_HOSTS=$($ExtraHosts -join ',')"
))

# node.exe itself is the action, not a shell redirecting its output: stopping the task ends only
# the action's process, and a node under a shell would keep the port.
$node = (Get-Command node -CommandType Application).Source
$main = Join-Path $checkout 'packages\server\src\main.ts'
$action = New-ScheduledTaskAction -Execute $node -Argument "--env-file=`"$envFile`" `"$main`"" `
    -WorkingDirectory $checkout
$trigger = New-ScheduledTaskTrigger -AtStartup
# S4U runs with nobody logged on and stores no password; it has no network credentials, which
# the server does not need.
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType S4U -RunLevel Limited
# The defaults stop a task after 72 hours and run it below normal priority, which the engines inherit.
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -Priority 5 `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal `
    -Settings $settings | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "Registered and started scheduled task $taskName. Its output: $logFile"
