# tests/pester/Db.Connect.Tests.ps1 — 4 tests DB via DSN (robuste Pester v5)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Describe 'Postgres - Connexion & I/O (persistant)' {

  BeforeAll {
    # Paramètres depuis l'env (fallbacks DEV)
    $script:PGHOST     = if ($env:PGHOST)     { $env:PGHOST }     else { '127.0.0.1' }
    $script:PGPORT     = if ($env:PGPORT)     { $env:PGPORT }     else { '5432' }
    $script:PGUSER     = if ($env:PGUSER)     { $env:PGUSER }     else { 'honoua' }
    $script:PGDATABASE = if ($env:PGDATABASE) { $env:PGDATABASE } else { 'honoua' }
    $pwd               = if ($env:PGPASSWORD) { $env:PGPASSWORD } else { 'HonouaDev_2025' }
    $pwdEnc            = [System.Uri]::EscapeDataString($pwd)

    # DSN (utiliser ${...} pour l’interpolation PowerShell)
    $script:DSN = "postgresql://${PGUSER}:${pwdEnc}@${PGHOST}:${PGPORT}/${PGDATABASE}"

    # binaire psql (sur runner Ubuntu: paquet postgresql-client)
    $script:Psql = 'psql'
  }

  It 'psql est accessible' {
    (& $script:Psql --version) 2>&1 | Should -Match '^psql \(PostgreSQL\) \d+'
  }

  It 'SELECT 1 retourne 1' {
    $out = (& $script:Psql $script:DSN -t -A -q -X -c "SELECT 1;") 2>&1
    $LASTEXITCODE | Should -Be 0 -Because $out
    ($out -join "`n").Trim() | Should -Be '1' -Because "Out='$out'"
  }

  It 'CREATE TABLE IF NOT EXISTS public.ci_probe' {
    $sql = "CREATE TABLE IF NOT EXISTS public.ci_probe (id SERIAL PRIMARY KEY, note TEXT);"
    $out = (& $script:Psql $script:DSN -t -A -q -X -c $sql) 2>&1
    $LASTEXITCODE | Should -Be 0 -Because $out
  }

  It 'INSERT puis COUNT>0 sur public.ci_probe' {
    $note = "pester-" + [guid]::NewGuid().ToString("N").Substring(0,8)
    $ins  = (& $script:Psql $script:DSN -t -A -q -X -c "INSERT INTO public.ci_probe(note) VALUES ('$note');") 2>&1
    $LASTEXITCODE | Should -Be 0 -Because $ins

    $cnt  = (& $script:Psql $script:DSN -t -A -q -X -c "SELECT COUNT(*) FROM public.ci_probe;") 2>&1
    $LASTEXITCODE | Should -Be 0 -Because $cnt
    [int](($cnt -join "`n").Trim()) | Should -BeGreaterThan 0 -Because "Out='$cnt'"
  }
}
