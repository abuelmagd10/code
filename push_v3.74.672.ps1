$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.671.ps1") { Remove-Item -LiteralPath "push_v3.74.671.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.672"') {
    Write-Host "+ 3.74.672" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.672]")) { Write-Host "X CHANGELOG missing [3.74.672]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

if (-not (Test-Path "supabase/migrations/20260716000672_v3_74_672_activate_withdrawal_gate.sql")) { Write-Host "X 672 migration record missing" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "node_modules/exceljs/package.json")) {
    Write-Host "Installing exceljs..." -ForegroundColor Cyan
    & npm install exceljs --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }
$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
# Guard: activate_booking_atomic must now carry the withdrawal gate.
# Bound the function body from its CREATE line to just before the NEXT
# function's CREATE (robust to the $function$ / newline terminator format).
$act = [regex]::Match($fn, "CREATE OR REPLACE FUNCTION public\.activate_booking_atomic[\s\S]*?(?=\r?\nCREATE OR REPLACE FUNCTION|\z)")
if (-not $act.Success -or $act.Value -notmatch "booking_blocking_withdrawals_exist") {
    Write-Host "X activate_booking_atomic missing the withdrawal gate in snapshot" -ForegroundColor Red; exit 1
}
Write-Host "+ snapshot: activate_booking_atomic carries the withdrawal gate" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "supabase/migrations/20260716000672_v3_74_672_activate_withdrawal_gate.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.672.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.671.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_672.txt"
    $msgLines = @(
        'fix(bookings): v3.74.672 - enforce stock-withdrawal approval on the execute-service path',
        '',
        '- activate_booking_atomic now runs booking_blocking_withdrawals_exist',
        '  (before the inventory gate), same as the /complete route. An attached',
        '  item flagged requires_withdrawal_approval can no longer be executed',
        '  without the branch store manager''s approval, even when stock is',
        '  available. Items not requiring approval are unaffected.',
        '- Verified live (rolled back) on BKG-2026-00004.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.672 pushed - withdrawal approval enforced on execute" -ForegroundColor Green
}
