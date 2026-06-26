$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.364.ps1") { Remove-Item -LiteralPath "push_v3.74.364.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.365"') {
    Write-Host "+ 3.74.365" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$bt = Get-Content -LiteralPath "components/sales-orders/BookingsTab.tsx" -Raw
foreach ($n in @(
    'services are per-branch, so the same name can',
    'const nameCount = new Map<string, number>',
    'isDuplicate && branchName'
)) {
    if ($bt -notmatch [regex]::Escape($n)) {
        Write-Host "X BookingsTab missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ BookingsTab: service picker disambiguates duplicates" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_365.txt"
    $msgLines = @(
        'fix(bookings): v3.74.365 - service filter dedupes same name across branches',
        '',
        'Owner: the service filter in the bookings tab showed the same',
        'service name ("تقشير") three times because services are stored',
        'per-branch since v3.74.319 (one row per branch, distinct ids).',
        'Selecting any of them still filtered correctly, but the picker',
        'looked broken.',
        '',
        'Fix',
        '  When a service name appears more than once across the company,',
        '  the picker label is suffixed with the branch name:',
        '    "تقشير — مدينة نصر"',
        '    "تقشير — الفرع الرئيسى"',
        '  Unique names stay unchanged ("تقشير" only).',
        '',
        'Files',
        '  components/sales-orders/BookingsTab.tsx',
        '  lib/version.ts -> 3.74.365'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.365 pushed" -ForegroundColor Green
}
