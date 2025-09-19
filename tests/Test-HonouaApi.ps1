# ---------------------------
# Honoua - Tests API (PowerShell)
# ---------------------------

param(
  [string]$BaseUrl = "http://127.0.0.1:8000"
)

$ErrorActionPreference = "Stop"
$results = @()

function Invoke-Test {
  param(
    [string]$Name,
    [string]$Method = "GET",
    [string]$Path,
    [hashtable]$Headers = @{ "Accept" = "application/json" },
    [object]$Body = $null,
    [int]$ExpectedStatus = 200,
    [scriptblock]$ExtraChecks = $null
  )

  $uri = "$BaseUrl$Path"
  $start = Get-Date

  try {
    if ($Method -eq "GET") {
      $resp = Invoke-RestMethod -Uri $uri -Method GET -Headers $Headers
      $raw  = Invoke-WebRequest -Uri $uri -Method GET -Headers $Headers
      $code = $raw.StatusCode
    } elseif ($Method -eq "POST") {
      $resp = Invoke-RestMethod -Uri $uri -Method POST -Headers $Headers -Body ($Body | ConvertTo-Json -Depth 8) -ContentType "application/json"
      $raw  = Invoke-WebRequest -Uri $uri -Method POST -Headers $Headers -Body ($Body | ConvertTo-Json -Depth 8) -ContentType "application/json"
      $code = $raw.StatusCode
    } else {
      throw "Méthode HTTP non gérée: $Method"
    }

    $okStatus = ($code -eq $ExpectedStatus)
    $okChecks = $true
    $checksMsg = "OK"

    if ($okStatus -and $ExtraChecks) {
      try {
        & $ExtraChecks -ArgumentList $resp
      } catch {
        $okChecks = $false
        $checksMsg = "Échec vérif: $($_.Exception.Message)"
      }
    }

    $ok = $okStatus -and $okChecks
    $msg = if ($ok) { "OK" } else { "Status=$code, Attendu=$ExpectedStatus; $checksMsg" }

  } catch {
    $ok = $false
    $code = -1
    $msg = "Exception: $($_.Exception.Message)"
  }

  $dur = (Get-Date) - $start
  $results += [pscustomobject]@{
    Test        = $Name
    Path        = $Path
    Status      = $code
    Success     = $ok
    Message     = $msg
    DurationMs  = [int]$dur.TotalMilliseconds
    Timestamp   = (Get-Date).ToString("s")
  }
}

Write-Host "== Honoua API tests =="
Write-Host "Base URL: $BaseUrl"
Write-Host ""

# ---- Plan de tests ----
# 1) /health -> 200 + champ 'status' attendu
Invoke-Test -Name "Health" -Path "/health" -ExtraChecks {
  param($json)
  if (-not $json.status) { throw "champ 'status' absent" }
}

# 2) /products (liste) -> 200 + collection
Invoke-Test -Name "Products list (limit=3)" -Path "/products?limit=3" -ExtraChecks {
  param($json)
  if (-not ($json -is [System.Collections.IEnumerable])) { throw "réponse non itérable (liste attendue)" }
}

# 3) /products/{ean} -> 404 pour un EAN volontairement inexistant (valide la gestion d’erreur)
Invoke-Test -Name "Product by EAN (not found)" -Path "/products/0000000000000" -ExpectedStatus 404

# 4) /metrics/categories -> 200 + structure JSON
Invoke-Test -Name "Metrics categories" -Path "/metrics/categories" -ExtraChecks {
  param($json)
  if (-not $json) { throw "JSON vide" }
}

# ---- Rapport ----
$allOk = -not ($results | Where-Object { -not $_.Success })

$folder = Join-Path -Path (Get-Location) -ChildPath "reports"
if (-not (Test-Path $folder)) { New-Item -ItemType Directory -Path $folder | Out-Null }
$stamp  = (Get-Date).ToString("yyyyMMdd_HHmmss")
$outCsv = Join-Path $folder "honoua_api_tests_$stamp.csv"

$results | Export-Csv -NoTypeInformation -Path $outCsv
Write-Host ""
Write-Host "Résumé :"
$results | Format-Table -AutoSize

Write-Host ""
Write-Host "Rapport CSV : $outCsv"

if ($allOk) {
  Write-Host "`n✅ Tous les tests sont PASS" -ForegroundColor Green
  exit 0
} else {
  Write-Host "`n❌ Des tests ont échoué" -ForegroundColor Red
  exit 1
}
