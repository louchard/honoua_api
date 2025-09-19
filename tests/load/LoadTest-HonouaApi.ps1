param(
  [string]$BaseUrl    = "http://127.0.0.1:8000",
  [string]$Endpoint   = "/products",     # ex: "/metrics/categories"
  [hashtable]$Params,                    # ex: @{ limit = 50; page = 1 }
  [string]$QueryString,                  # ex: "limit=50&page=1" (prioritaire sur -Params)
  [int]   $Requests   = 200,
  [int]   $Concurrency = 10,
  [int]   $Limit      = 50,              # compat: ajoute "limit" si non present pour /products
  [int]   $TimeoutSec = 10,
  [int]   $Warmup     = 5,

  # --- Seuils d'alerte ---
  [double]$MaxErrorRate = 0,             # en pourcentage, ex: 1 => 1% max
  [int]   $MaxP95Ms     = 0              # en millisecondes, ex: 500 => p95 <= 500ms
)

$ErrorActionPreference = "Stop"

function New-ReportsFolder {
  $folder = Join-Path -Path (Get-Location) -ChildPath "reports"
  if (-not (Test-Path $folder)) { New-Item -ItemType Directory -Path $folder | Out-Null }
  return $folder
}

function Get-Percentile {
  param([int[]]$Values, [double]$P)
  if (-not $Values -or $Values.Count -eq 0) { return $null }
  $sorted = $Values | Sort-Object
  $n = $sorted.Count
  $idx = [Math]::Ceiling($P * $n) - 1
  if ($idx -lt 0) { $idx = 0 }
  if ($idx -ge $n) { $idx = $n - 1 }
  return $sorted[$idx]
}

function Build-Query {
  param([hashtable]$Params, [string]$QueryString)
  if ($QueryString -and $QueryString.Trim().Length -gt 0) { return "?$QueryString" }
  if (-not $Params -or $Params.Keys.Count -eq 0) { return "" }
  $pairs = foreach ($k in $Params.Keys) {
    $ek = [System.Uri]::EscapeDataString([string]$k)
    $ev = [System.Uri]::EscapeDataString([string]$Params[$k])
    "$ek=$ev"
  }
  return "?" + ($pairs -join "&")
}

# Parse BaseUrl -> host/port
try {
  $u = [uri]$BaseUrl
  $apiHost = $u.Host
  $apiPort = $u.Port
} catch {
  Write-Host ("ERROR: BaseUrl invalide: {0}" -f $BaseUrl) -ForegroundColor Red
  exit 1
}

# Quick network check
$tnc = Test-NetConnection $apiHost -Port $apiPort -WarningAction SilentlyContinue
if (-not $tnc.TcpTestSucceeded) {
  Write-Host ("ERROR: Port {0}:{1} indisponible. Lance l'API puis reessaye." -f $apiHost, $apiPort) -ForegroundColor Red
  exit 1
}

# Merge params: conserve -Limit si non present (pour /products)
$effParams = @{}
if ($Params) { $Params.GetEnumerator() | ForEach-Object { $effParams[$_.Key] = $_.Value } }
if (-not $QueryString -and -not $effParams.ContainsKey("limit") -and $Limit -gt 0 -and $Endpoint -match "/products") {
  $effParams["limit"] = $Limit
}

$qs     = Build-Query -Params $effParams -QueryString $QueryString
$target = "$BaseUrl$Endpoint$qs"

Write-Host ("Cible       : {0}" -f $target)
Write-Host ("Requetes    : {0} | Concurrence : {1} | Timeout : {2}s" -f $Requests, $Concurrency, $TimeoutSec)
if ($MaxErrorRate -gt 0 -or $MaxP95Ms -gt 0) {
  Write-Host ("Seuils      : MaxErrorRate={0}%  MaxP95Ms={1}ms" -f $MaxErrorRate, $MaxP95Ms)
}

# Warm-up
if ($Warmup -gt 0) {
  Write-Host ("Warm-up ({0} req)..." -f $Warmup)
  for ($w=1; $w -le $Warmup; $w++) {
    try { Invoke-WebRequest -Uri $target -UseBasicParsing -TimeoutSec $TimeoutSec | Out-Null } catch { }
  }
}

$swAll = [System.Diagnostics.Stopwatch]::StartNew()
$results = New-Object System.Collections.Generic.List[object]
$running = @()

function Drain-One {
  param($job)
  try {
    $out = Receive-Job $job -ErrorAction SilentlyContinue
    if ($out) { [void]$results.Add($out) }
  } catch {
    [void]$results.Add([pscustomobject]@{
      Index = -1; Status = -1; Success = $false; DurationMs = 0; Error = $_.Exception.Message
    })
  } finally {
    Remove-Job $job -Force -ErrorAction SilentlyContinue | Out-Null
  }
}

for ($i=1; $i -le $Requests; $i++) {
  while ($running.Count -ge $Concurrency) {
    $done = Wait-Job -Job $running -Any -Timeout 5
    if ($done) {
      Drain-One -job $done
      $running = $running | Where-Object { $_.Id -ne $done.Id }
    }
  }

  $job = Start-Job -ScriptBlock {
    param($idx, $url, $timeout)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
      $resp = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec $timeout -UseBasicParsing
      $ok   = ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
      $code = [int]$resp.StatusCode
      $sw.Stop()
      [pscustomobject]@{
        Index      = $idx
        Status     = $code
        Success    = $ok
        DurationMs = [int]$sw.Elapsed.TotalMilliseconds
        Error      = $null
      }
    } catch {
      $sw.Stop()
      [pscustomobject]@{
        Index      = $idx
        Status     = -1
        Success    = $false
        DurationMs = [int]$sw.Elapsed.TotalMilliseconds
        Error      = $_.Exception.Message
      }
    }
  } -ArgumentList @($i, $target, $TimeoutSec)

  $running += $job
}

while ($running.Count -gt 0) {
  $done = Wait-Job -Job $running -Any -Timeout 5
  if ($done) {
    Drain-One -job $done
    $running = $running | Where-Object { $_.Id -ne $done.Id }
  }
}

$swAll.Stop()

$all = $results | ForEach-Object { $_ }
$ok  = $all | Where-Object { $_.Success -eq $true }
$ko  = $all | Where-Object { $_.Success -ne $true }

$lat = $ok | Select-Object -ExpandProperty DurationMs
$min = if ($lat) { ($lat | Measure-Object -Minimum).Minimum } else { $null }
$max = if ($lat) { ($lat | Measure-Object -Maximum).Maximum } else { $null }
$avg = if ($lat) { [int](($lat | Measure-Object -Average).Average) } else { $null }

function Get-P { param([int[]]$v,[double]$p)
  if (-not $v -or $v.Count -eq 0) { return $null }
  $sorted = $v | Sort-Object
  $n = $sorted.Count
  $idx = [Math]::Ceiling($p * $n) - 1
  if ($idx -lt 0) { $idx = 0 }
  if ($idx -ge $n) { $idx = $n - 1 }
  return $sorted[$idx]
}
$p50 = if ($lat) { Get-P -v $lat -p 0.50 } else { $null }
$p90 = if ($lat) { Get-P -v $lat -p 0.90 } else { $null }
$p95 = if ($lat) { Get-P -v $lat -p 0.95 } else { $null }
$p99 = if ($lat) { Get-P -v $lat -p 0.99 } else { $null }

$total     = $all.Count
$successes = $ok.Count
$errors    = $ko.Count
$errRate   = if ($total -gt 0) { [math]::Round(100.0 * $errors / $total, 2) } else { 0 }
$seconds   = [math]::Max($swAll.Elapsed.TotalSeconds, 0.001)
$tps       = [math]::Round($total / $seconds, 2)

$reports = New-ReportsFolder
$stamp   = (Get-Date).ToString("yyyyMMdd_HHmmss")
$csvPath = Join-Path $reports "honoua_loadtest_$stamp.csv"
$all | Export-Csv -NoTypeInformation -Path $csvPath

Write-Host ""
Write-Host "===== Resume mini charge ====="
Write-Host ("Total       : {0} req" -f $total)
Write-Host ("Succes      : {0}  |  Echecs : {1}  (Taux erreur: {2}%)" -f $successes, $errors, $errRate)
Write-Host ("Debit moyen : {0} req/s (sur {1:N2}s)" -f $tps, $seconds)
Write-Host ("Latences ms : min={0} avg={1} p50={2} p90={3} p95={4} p99={5} max={6}" -f $min,$avg,$p50,$p90,$p95,$p99,$max)
Write-Host ("CSV detaille: {0}" -f $csvPath)

# --- Evaluation des seuils ---
$breaches = @()

if ($MaxErrorRate -gt 0 -and $errRate -gt $MaxErrorRate) {
  $breaches += ("ErrorRate {0}% > MaxErrorRate {1}%" -f $errRate, $MaxErrorRate)
}
if ($MaxP95Ms -gt 0 -and $p95 -ne $null -and $p95 -gt $MaxP95Ms) {
  $breaches += ("p95 {0} ms > MaxP95Ms {1} ms" -f $p95, $MaxP95Ms)
}
if ($MaxP95Ms -gt 0 -and $p95 -eq $null) {
  $breaches += ("p95 indisponible (aucune reponse OK).")
}

if ($breaches.Count -gt 0) {
  Write-Host ""
  Write-Host "SEUILS DEPASSES :" -ForegroundColor Red
  $breaches | ForEach-Object { Write-Host (" - {0}" -f $_) -ForegroundColor Red }
  exit 2
}

exit 0
