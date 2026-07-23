$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.799.ps1") { Remove-Item -LiteralPath "push_v3.74.799.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.800"') {
    Write-Host "+ 3.74.800" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.800]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.800]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- decision notifications route to the booking, positively asserted -----------
$routing = Get-Content -LiteralPath "lib/notification-routing.ts" -Raw
foreach ($must in @(
    'booking_withdrawal_decided:',
    'booking_withdrawal_voided:',
    '/approvals?tab=bwd'
)) {
    if ($routing -notmatch [regex]::Escape($must)) {
        Write-Host "X withdrawal routing incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
$mig = Get-Content -LiteralPath "supabase/migrations/20260723000006_v3_74_800_decided_withdrawal_routes_to_booking.sql" -Raw
if ($mig -notmatch [regex]::Escape('p_booking_id::text')) {
    Write-Host "X the voided event key does not carry the booking id" -ForegroundColor Red; exit 1
}
Write-Host "+ decisions land on the booking; requests stay on the approvals inbox" -ForegroundColor Green

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
    "lib/notification-routing.ts" `
    "supabase/migrations/20260723000006_v3_74_800_decided_withdrawal_routes_to_booking.sql" `
    "push_v3.74.800.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.799.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_800.txt"
    $msgLines = @(
        'fix(notifications): v3.74.800 - withdrawal DECISIONS route to the booking',
        '',
        'Live-caught by the owner: the executor clicked "withdrawal approved"',
        'and landed on the approvals inbox - a page whose actions belong to',
        'the store manager. The requester''s next step lives on the BOOKING',
        '(start the service).',
        '',
        'Routing is now event-aware: decided/voided notifications open',
        '/bookings/<id> (the booking id rides the event key''s tail); the',
        'manager''s REQUEST notification keeps the approvals inbox tab. The',
        'auto-void event key (v3.74.797) now carries the booking id too',
        '(DB fn updated on test + prod; migration is the repo record).',
        '',
        'Logged for later: name the product inside withdrawal notification',
        'texts instead of the generic "product".'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.800 pushed - decisions land where the next action lives" -ForegroundColor Green
}
