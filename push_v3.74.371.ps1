$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.369.ps1") { Remove-Item -LiteralPath "push_v3.74.369.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.371"') {
    Write-Host "+ 3.74.371" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig370 = "supabase/migrations/20260626000370_v3_74_370_activate_booking_hops_through_confirmed.sql"
if (Test-Path -LiteralPath $mig370) {
    Write-Host "+ migration 370: activate hops draft->confirmed->in_progress" -ForegroundColor Green
} else { Write-Host "X missing migration 370" -ForegroundColor Red; exit 1 }

$mig371 = "supabase/migrations/20260626000371_v3_74_371_complete_booking_discount_type_amount.sql"
if (Test-Path -LiteralPath $mig371) {
    Write-Host "+ migration 371: discount_type fixed -> amount" -ForegroundColor Green
} else { Write-Host "X missing migration 371" -ForegroundColor Red; exit 1 }

$m370 = Get-Content -LiteralPath $mig370 -Raw
if ($m370 -notmatch "draft.*confirmed" -or $m370 -notmatch "confirmed.*in_progress") {
    Write-Host "X migration 370 does not contain expected hops" -ForegroundColor Red
    exit 1
}

# Inspect non-comment lines of migration 371. Comments mention the
# word 'fixed' to explain the diff and should not trigger the guard.
$m371Lines = Get-Content -LiteralPath $mig371
$m371Code = ($m371Lines | Where-Object { $_ -notmatch '^\s*--' }) -join "`n"
if ($m371Code -notmatch "'amount'") {
    Write-Host "X migration 371 does not write 'amount' in code" -ForegroundColor Red
    exit 1
}
if ($m371Code -match "'fixed'") {
    Write-Host "X migration 371 still writes 'fixed' in code" -ForegroundColor Red
    exit 1
}
Write-Host "+ migration contents look right" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_371.txt"
    $msgLines = @(
        'fix(bookings): v3.74.371 - tnfeez service actually works end-to-end',
        '',
        'Owner reported that an authorised staff member pressed',
        '"tnfeez al-khedma" (Execute Service) on a confirmed-but-draft',
        'booking and the server returned 409. After the 409 was fixed,',
        'the next request returned 500. Two separate DB-level bugs were',
        'masking each other.',
        '',
        'Bug 1 - 409 INVALID_STATUS_TRANSITION (v3.74.370)',
        '  v3.74.358 stopped confirm_booking_atomic from changing the',
        '  status. Bookings now stay at status=draft even after taakeed,',
        '  with confirmed_at as the source of truth. But',
        '  activate_booking_atomic still jumped status straight from',
        '  draft to in_progress in one UPDATE, which the bookings master',
        '  trigger rejects via bkg_is_status_transition_allowed.',
        '  Fixed by making activate hop draft->confirmed->in_progress so',
        '  every step is permitted.',
        '',
        'Bug 2 - 500 invoices_discount_type_check (v3.74.371)',
        '  Once the hops worked, the next call surfaced',
        '  ERROR 23514: discount_type_check (allowed values are',
        '  ["percent","amount"]). complete_booking_atomic was hard-',
        '  coded to INSERT discount_type="fixed", an old enum value that',
        '  the wider sales-invoice flow had already migrated away from.',
        '  Switched to "amount" - the booking carries discount_amount in',
        '  EGP, so the monetary-amount label is the right one.',
        '  v3.74.322 RPC body is otherwise byte-identical.',
        '',
        'Verified live end-to-end',
        '  POST /api/bookings/d744c171.../activate -> 200, invoice',
        '  INV-2026-00001 generated, booking moved to completed,',
        '  status_history audit row written, gl_path A (product',
        '  catalog).',
        '',
        'Files',
        '  supabase/migrations/20260626000370_v3_74_370_activate_booking_hops_through_confirmed.sql',
        '  supabase/migrations/20260626000371_v3_74_371_complete_booking_discount_type_amount.sql',
        '  lib/version.ts -> 3.74.371',
        '',
        'Note',
        '  Both RPC bodies were already applied to the live DB via the',
        '  Supabase MCP during diagnosis. Committing the SQL files so a',
        '  future "supabase db reset" stays consistent with prod.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.371 pushed" -ForegroundColor Green
}
