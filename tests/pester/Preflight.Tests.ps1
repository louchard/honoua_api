# tests/pester/Preflight.Tests.ps1
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-Http([string]$path) {
  $uri = ($script:BASE_URL.TrimEnd('/')) + $path
  return Invoke-WebRequest -Uri $uri -TimeoutSec 15
}

Describe 'Honoua - Préflight CI' {

  BeforeAll {
    $script:BASE_URL = $env:BASE_URL
    if ([string]::IsNullOrWhiteSpace($script:BASE_URL)) { $script:BASE_URL = 'http://127.0.0.1:3000' }
    Write-Host ">> Preflight - BASE_URL utilisé: $script:BASE_URL"
  }

  It 'BASE_URL est défini' {
    $script:BASE_URL | Should -Match '^http'
  }

It 'GET /health -> 200 & status ok (texte ou JSON)' {
  $uri = ($script:BASE_URL.TrimEnd('/')) + '/health'

  # 1) Si la requête 2xx échoue, Invoke-RestMethod lèvera une exception => test rouge.
  $resp = Invoke-RestMethod -Uri $uri -Method GET -TimeoutSec 15 -ErrorAction Stop

  # 2) Accepte JSON { "status": "ok" } OU texte "ok" / "ok|status"
  $ok = $false
  if ($null -ne $resp) {
    if ($resp -is [string]) {
      $txt = $resp.Trim()
      $ok = ($txt -match '^(ok|ok\|status)$')
    } else {
      try { $ok = ($resp.status -eq 'ok') } catch { $ok = $false }
    }
  }

  $ok | Should -BeTrue -Because ("Body='{0}'" -f ($resp | Out-String).Trim())
}
 

  It 'Fichiers clés présents (app/ci_main.py & workflow)' {
    (Test-Path './app/ci_main.py') | Should -BeTrue
    (Test-Path './.github/workflows/ci.yml') | Should -BeTrue
  }

  It 'Python & paquets essentiels disponibles' {
    $ver = (& python --version) 2>&1
    $LASTEXITCODE | Should -Be 0
    $ver | Should -Match '^Python 3\.'

    $out = (& python -c "import uvicorn, fastapi; print('ok')") 2>&1
    $LASTEXITCODE | Should -Be 0
    ($out -join "`n").Trim() | Should -Be 'ok'
  }
}
