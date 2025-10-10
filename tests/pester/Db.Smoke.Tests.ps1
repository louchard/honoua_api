# tests/pester/Db.Smoke.Tests.ps1
# Smoke: vérifie qu'on peut interroger la DB et récupérer son nom

BeforeAll {
    # Chaîne de connexion via les variables d'env que la CI utilise déjà
    $script:Conn = "host=$env:PGHOST port=$env:PGPORT dbname=$env:PGDATABASE user=$env:PGUSER password=$env:PGPASSWORD sslmode=disable"
}

Describe "DB Smoke Test" {
    It "can read current_database()" {
        $query  = "SELECT current_database();"
        $output = psql $script:Conn -t -A -c $query 2>$null
        $output | Should -Not -BeNullOrEmpty
        $output.Trim() | Should -Be $env:PGDATABASE
    }
}
