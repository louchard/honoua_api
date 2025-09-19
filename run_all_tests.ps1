param(
  [string]$BaseUrl = "http://127.0.0.1:8000",
  [int]$LoadRequests = 200,
  [int]$MaxP95Ms = 600,
  [double]$MinSuccessRatePct = 99
)

$ErrorActionPreference = "Stop"

# 1) Sanity check API
$BaseUrl = $BaseUrl.Trim().Trim('"', "'").TrimEnd('/')
if (-not [Uri]::IsWellFormedUriString($BaseUrl, [UriKind]::Absolute)) { throw "BaseUrl invalide: $BaseUrl" }
"BaseUrl: $BaseUrl"
Test-NetConnection 127.0.0.1 -Port ([uri]$BaseUrl).Port

# 2) Pester tests
Remove-Module Pester -ErrorAction SilentlyContinue
$mod = Get-Module -ListAvailable Pester | Sort-Object Version -Descending | Select-Object -First 1
Import-Module $mod -Force
"Using Pester v$((Get-Module Pester).Version)"

$testsPath = "C:\honoua_api\tests\pester\Honoua.Api.Tests.ps1"
Invoke-Pester -Path $testsPath -CI -Output Detailed
$pesterExit = $LASTEXITCODE
if ($pesterExit -ne 0) {
  Write-Error "Pester a échoué (code $pesterExit)."
  exit $pesterExit
}

# 3) Load test avec seuils
$loadScript = "C:\honoua_api\tests\load\LoadTest-HonouaApi.ps1"
& $loadScript -BaseUrl $BaseUrl -Path "/products?limit=50" -Requests $LoadRequests -MaxP95Ms $MaxP95Ms -MinSuccessRatePct $MinSuccessRatePct
$loadExit = $LASTEXITCODE

if ($loadExit -eq 0) {
  Write-Host "`n✅ Tous les tests sont PASS (fonctionnels + perf)" -ForegroundColor Green
  exit 0
} else {
  Write-Host "`n❌ Test de charge: seuils non respectés" -ForegroundColor Red
  exit $loadExit
}
