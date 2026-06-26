$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.365.ps1") { Remove-Item -LiteralPath "push_v3.74.365.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.366"') {
    Write-Host "+ 3.74.366" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$bt = Get-Content -LiteralPath "components/sales-orders/BookingsTab.tsx" -Raw
if ($bt -notmatch [regex]::Escape('v3.74.366 — only active services')) {
    Write-Host "X BookingsTab missing v3.74.366 marker" -ForegroundColor Red; exit 1
}
if ($bt -notmatch [regex]::Escape('/api/services?limit=500&is_active=true')) {
    Write-Host "X BookingsTab not filtering is_active=true" -ForegroundColor Red; exit 1
}
Write-Host "+ BookingsTab: service picker hides archived services" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_366.txt"
    $msgLines = @(
        'fix(bookings): v3.74.366 - service filter hides archived services',
        '',
        'Owner: the service filter in the bookings tab still showed',
        '"تقشير" three times after v3.74.365 even though only one is',
        'active. Investigation showed two archived rows + one active',
        'in the same branch:',
        '  SVC-0001 (is_active=false)',
        '  SVC-0002 (is_active=false)',
        '  SVC-0003 (is_active=true)',
        'The branch-suffix logic from v3.74.365 could not disambiguate',
        'them because they share a branch.',
        '',
        'Fix',
        '  Pass is_active=true to /api/services when loading the picker',
        '  options. Archived services no longer appear, the picker shows',
        '  only "تقشير" once.',
        '',
        'Files',
        '  components/sales-orders/BookingsTab.tsx',
        '  lib/version.ts -> 3.74.366'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.366 pushed" -ForegroundColor Green
}
