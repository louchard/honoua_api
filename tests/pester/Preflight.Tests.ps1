# tests/pester/Preflight.Tests.ps1
# 4 tests "verts" : BASE_URL, /health, fichiers clés, Python ready

$ErrorActionPreference = 'Stop'
$BASE_URL = $env:BASE_URL
if ([string]::IsNullOrWhiteSpace($BASE_URL)) { $BASE_URL = 'http://127.0.0.1:3000' }

function Get-Http($path) {
  $uri = ($BASE_URL.TrimEnd('/')) + $path
  return Invoke-WebRequest -Uri $uri -Headers @{ 'User-Agent'='honoua-ci-pester' } -TimeoutSec 15
}

Describe 'Honoua - Préflight CI' {

  It 'BASE_URL est défini' {
    $BASE_URL | Should -Not -BeNullOrEmpty
  }

  It 'GET /health -> 200 & status ok (texte ou JSON)' {
    $r = Get-Http '/health'
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
    # Python répond
    $ver = (& python --version) 2>&1
    $LASTEXITCODE | Should -Be 0
    $ver | Should -Match '^Python 3\.'

    # uvicorn + fastapi importables
    $out = (& python -c "import uvicorn, fastapi; print('ok')") 2>&1
    $LASTEXITCODE | Should -Be 0
    ($out -join "`n").Trim() | Should -Be 'ok'
  }
}
