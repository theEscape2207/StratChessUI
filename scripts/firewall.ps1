# Opens the server port to the home LAN: inbound TCP, Private profile, local subnet only.
# Run from an elevated PowerShell. -Remove deletes the rule again.
#Requires -RunAsAdministrator
param(
    [int]$Port = 8080,
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$ruleName = 'StratChessUI'

Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if ($Remove) {
    Write-Host "Removed firewall rule $ruleName."
    return
}

New-NetFirewallRule -Name $ruleName -DisplayName "StratChessUI (TCP $Port, LAN)" `
    -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port `
    -Profile Private -RemoteAddress LocalSubnet | Out-Null
Write-Host "Allowed inbound TCP $Port from the local subnet on Private networks."

# The rule applies only while the network is Private; Windows often files a new network as Public.
Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -ne 'Private' } | ForEach-Object {
    Write-Warning ("'$($_.Name)' on $($_.InterfaceAlias) is $($_.NetworkCategory). If it is the home " +
        "network: Set-NetConnectionProfile -InterfaceAlias '$($_.InterfaceAlias)' -NetworkCategory Private")
}

# Windows's first-run prompt for node.exe leaves program-wide rules: Allow opens every port Node
# listens on, from any address; Block (the prompt cancelled) beats this rule's Allow.
$nodeRules = Get-NetFirewallApplicationFilter | Where-Object { $_.Program -like '*\node.exe' } |
    Get-NetFirewallRule | Where-Object { $_.Direction -eq 'Inbound' -and $_.Enabled -eq 'True' }
foreach ($rule in $nodeRules) {
    Write-Warning ("Program-wide inbound $($rule.Action) rule '$($rule.DisplayName)' ($($rule.Profile)) " +
        "for node.exe; so that this rule alone decides: Disable-NetFirewallRule -Name '$($rule.Name)'")
}
