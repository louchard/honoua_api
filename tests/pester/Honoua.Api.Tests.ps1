# Honoua - Pester API tests (robuste PS 5.1/7)
# Exécution : Invoke-Pester -Path . -CI -Output Detailed

$ErrorActionPreference = "Stop"

# BaseUrl surchargable via variable d'env (utile en CI)
$BaseUrl = if ($env:HONOUA_BASEURL) { $env:HONOUA_BASEURL } else { "http://127.0.0.1:8000" }

# Helper GET qui NE JETTE PAS sur erreur de connexion : renvoie Code=-1 et Error
function Get-Api {
  param(
    [string]$Path,
    [int]$TimeoutSec = 10
  )
  $uri = "$BaseUrl$Path"
  try {
    # -UseBasicParsing pour compat PS 5.1
    $raw  = Invoke-WebRequest -Uri $uri -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing
    $json = $null
    try { $json = $raw.Content | ConvertFrom-Json } catch {}
    return [pscustomobject]@{ Code = $raw.StatusCode; Json = $json; Error = $null }
  } catch {
    $code = $null
    $err  = $_.Exception.Message
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $code = [int]$_.Exception.Response.StatusCode
    }
    return [pscustomobject]@{ Code = ( $code ? $code : -1 ); Json = $null; Error = $err }
  }
}

Describe "Honoua API ($BaseUrl)" {
  BeforeAll {
    # Vérifie l'écoute sans jeter d'exception
    $script:portUp = $false
    try {
      $u = [uri]$BaseUrl
      $host = if ($u.Host) { $u.Host } else { "127.0.0.1" }
      $port = if ($u.Port) { $u.Port } else { 80 }
      $tnc = Test-NetConnection $host -Port $port -WarningAction SilentlyContinue
      $script:portUp = ($tnc.TcpTestSucceeded -eq $true)
    } catch {
      $script:portUp = $false
    }
  }

  It "Le port de l'API est ouvert" {
    $portUp | Should -BeTrue
  }

  It "GET /health -> 200 et contient 'status'" -Skip:(-not $portUp) {
    $r = Get-Api "/health"
    # Si la connexion a échoué, Code=-1 => assertion claire
    $r.Code   | Should -Be 200
    $r.Json   | Should -Not -BeNullOrEmpty
    $r.Json.PSObject.Properties.Name | Should -Contain "status"
  }

  It "GET /products?limit=3 -> 200 et renvoie une liste" -Skip:(-not $portUp) {
    $r = Get-Api "/products?limit=3"
    $r.Code | Should -Be 200
    ($r.Json -is [System.Collections.IEnumerable]) | Should -BeTrue
  }

  It "GET /products/0000000000000 -> 404 (not found attendu)" -Skip:(-not $portUp) {
    $r = Get-Api "/products/0000000000000"
    $r.Code | Should -Be 404
  }

  It "GET /metrics/categories -> 200 et non vide" -Skip:(-not $portUp) {
    $r = Get-Api "/metrics/categories"
    $r.Code | Should -Be 200
    $r.Json | Should -Not -BeNullOrEmpty
  }
}
