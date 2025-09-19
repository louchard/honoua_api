param(
  [string]$BaseUrl = "http://127.0.0.1:8000"
)

$ErrorActionPreference = "Stop"
Write-Host "== Honoua API - Runner =="

# Dossier tests
$testsPath = Join-Path $PSScriptRoot "tests\pester"
if (-not (Test-Path $testsPath)) {
  $found = Get-ChildItem -Path $PSScriptRoot -Recurse -Filter *.Tests.ps1 -ErrorAction SilentlyContinue
  if ($found) { $testsPath = Split-Path -Parent $found[0].FullName }
}

if (-not (Test-Path $testsPath)) {
  Write-Host "❌ Dossier de tests introuvable." -ForegroundColor Red
  exit 1
}

# Diagnostic réseau
try {
  $u = [uri]$BaseUrl
  $host = $u.Host
  $port = $u.Port
} catch {
  Write-Host "❌ BaseUrl invalide: $BaseUrl" -ForegroundColor Red
  exit 1
}

Write-Host ("BaseUrl : {0}" -f $BaseUrl)
Write-Host ("Tests   : {0}" -f $testsPath)

$tnc = Test-NetConnection $host -Port $port -WarningAction SilentlyContinue
Write-Host ("Port {0}:{1} -> {2}" -f $host,$port, $(if ($tnc.TcpTestSucceeded) { "UP" } else { "DOWN" }))

# Expose l'URL aux tests
$env:HONOUA_BASEURL = $BaseUrl

# Rapports
$reports = Join-Path $PSScriptRoot "reports"
if (-not (Test-Path $reports)) { New-Item -ItemType Directory -Path $reports | Out-Null }
$junit = Join-Path $reports "pester-results.xml"

# Config Pester
$cfg = New-PesterConfiguration
$cfg.Run.Path = $testsPath
$cfg.Run.Exit = $true
$cfg.Output.Verbosity = "Detailed"
$cfg.TestResult.Enabled = $true
$cfg.TestResult.OutputPath = $junit
$cfg.TestResult.OutputFormat = "NUnitXml"

# Run
$result = Invoke-Pester -Configuration $cfg -PassThru

Write-Host ("Résumé: Passed={0} Failed={1} Skipped={2}" -f `
  $result.Result.Summary.PassedCount, `
  $result.Result.Summary.FailedCount, `
  $result.Result.Summary.SkippedCount)

Write-Host ("Rapport: {0}" -f $junit)
exit $result.Result.ExitCode
