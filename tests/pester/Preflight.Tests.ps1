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
    $r = Get-Http '/health'
    # Sur PowerShell 7, Invoke-WebRequest renvoie un objet contenant StatusCode
    $r.StatusCode | Should -Be 200

    $body = ($r.Content | Out-String).Trim()
    $json = $null; try { $json = $body | ConvertFrom-Json } catch {}

    $okText = $body -match '^(ok|ok\|status)$'
    $okJson = ($json -ne $null -and $json.status -eq 'ok')
    ($okText -or $okJson) | Should -BeTrue -Because "Body='$body'"
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
