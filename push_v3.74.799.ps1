$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.798.ps1") { Remove-Item -LiteralPath "push_v3.74.798.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.799"') {
    Write-Host "+ 3.74.799" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.799]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.799]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- confirm confirms + the executor knows his customer, positively asserted ----
$mig = Get-Content -LiteralPath "supabase/migrations/20260723000005_v3_74_799_confirm_actually_confirms.sql" -Raw
foreach ($must in @(
    "SET status       = 'confirmed'",
    "IF v_booking.status = 'confirmed' THEN",
    "AND confirmed_at IS NOT NULL"
)) {
    if ($mig -notmatch [regex]::Escape($must)) {
        Write-Host "X confirm-fix migration incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
$route = Get-Content -LiteralPath "app/api/bookings/[id]/route.ts" -Raw
foreach ($must in @(
    "createServiceClient",
    "if (!booking.customer_name && booking.customer_id) {",
    ".eq('company_id', companyId)"
)) {
    if ($route -notmatch [regex]::Escape($must)) {
        Write-Host "X customer identity supplement incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ confirm transitions the status; the executor sees whom he serves" -ForegroundColor Green

git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { Write-Host "X baseline mismatch" -ForegroundColor Red; exit 1 }

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out2 = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out2 -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
if (Test-Path ".next/types") { Remove-Item ".next/types" -Recurse -Force -ErrorAction SilentlyContinue }
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- "lib/version.ts" "CHANGELOG.md" `
    "app/api/bookings/[id]/route.ts" `
    "supabase/migrations/20260723000005_v3_74_799_confirm_actually_confirms.sql" `
    "push_v3.74.799.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.798.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_799.txt"
    $msgLines = @(
        'fix(bookings): v3.74.799 - confirm actually confirms; the executor knows his customer',
        '',
        'Two defects live-caught by the owner on BKG-2026-00007, scenario 1 of',
        'the booking-cycle test:',
        '',
        '1. confirm_booking_atomic stamped confirmed_at/by and sent the',
        '   confirmation notification - but the docstring''s promised',
        '   draft->confirmed transition was MISSING from the body. The page',
        '   chip said "draft" under a confirmation timestamp, and the',
        '   executor''s start step would have refused (the state machine',
        '   requires confirmed before in_progress). The UPDATE now sets the',
        '   status; idempotency keys on STATUS so re-clicks self-heal stamped',
        '   -but-draft bookings; a one-time backfill healed the stuck ones',
        '   through the legal transition (status history records it).',
        '',
        '2. The customer showed as a dash on the assigned EXECUTOR''s page:',
        '   v_bookings_full runs with the caller''s RLS, and a staff member''s',
        '   customers policy is creator-scoped, so the join returned NULL for',
        '   the very customer he is assigned to serve. GET /api/bookings/[id]',
        '   now supplements name/phone/email server-side, narrowly, for a',
        '   caller who has already proven the right to read THAT booking.',
        '',
        'DB migration applied to test + prod (rehearsed: confirm ->',
        'confirmed, second click idempotent); the route fix ships with this',
        'deploy.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.799 pushed - confirmed means confirmed" -ForegroundColor Green
}
