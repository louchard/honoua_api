$ErrorActionPreference = "Stop"
$BaseUrl = if ($env:HONOUA_BASEURL) { $env:HONOUA_BASEURL } else { "http://localhost:8000" }

function Get-Api {
  param([string]$Path,[int]$TimeoutSec=10)
  $uri = "$BaseUrl$Path"
  try {
    $raw  = Invoke-WebRequest -Uri $uri -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing
    $json = $null; try { $json = $raw.Content | ConvertFrom-Json } catch {}
    [pscustomobject]@{ Code=$raw.StatusCode; Json=$json; Error=$null }
  } catch {
    $code = if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {[int]$_.Exception.Response.StatusCode} else {-1}
    [pscustomobject]@{ Code=$code; Json=$null; Error=$_.Exception.Message }
  }
}

Describe "Honoua API ($BaseUrl)" {
  BeforeAll {
    # Probe /health directement au lieu de Test-NetConnection
    try {
      $h = Invoke-WebRequest -Uri "$BaseUrl/health" -TimeoutSec 10 -UseBasicParsing
      $script:apiUp = ($h.StatusCode -eq 200)
    } catch {
      $script:apiUp = $false
    }
  }

  It "API /health reachable" {
    $apiUp | Should -BeTrue
  }

  It "GET /health -> 200 & status" -Skip:(-not $apiUp) {
    $r = Get-Api "/health"
    $r.Code | Should -Be 200
    $r.Json | Should -Not -BeNullOrEmpty
    $r.Json.PSObject.Properties.Name | Should -Contain "status"
  }

  It "GET /products?limit=3 -> 200 & liste" -Skip:(-not $apiUp) {
    $r = Get-Api "/products?limit=3"
    $r.Code | Should -Be 200
    ($r.Json -is [System.Collections.IEnumerable]) | Should -BeTrue
  }

  It "GET /products/0000000000000 -> 404" -Skip:(-not $apiUp) {
    $r = Get-Api "/products/0000000000000"
    $r.Code | Should -Be 404
  }

  It "GET /metrics/categories -> 200 & non vide" -Skip:(-not $apiUp) {
    $r = Get-Api "/metrics/categories"
    $r.Code | Should -Be 200
    $r.Json | Should -Not -BeNullOrEmpty
  }
}
