$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
foreach ($old in @("push_v3.74.799.ps1","push_v3.74.800.ps1","push_v3.74.801.ps1")) {
    if (Test-Path $old) { Remove-Item -LiteralPath $old -Force }
}

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.802"') {
    Write-Host "+ 3.74.802" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.802]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.802]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- 800: decisions route to the booking ----------------------------------------
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
Write-Host "+ 800: decisions land on the booking; requests stay on the inbox" -ForegroundColor Green

# --- 801 + 802: the execute button - legal state + custody gate -----------------
$actions = Get-Content -LiteralPath "components/bookings/BookingActions.tsx" -Raw
foreach ($must in @(
    'const executable = status === "confirmed" || (isDraft && isConfirmed)',
    'booking_mandatory_custody_gate',
    'custodyBlocked',
    'disabled={discountGate !== "open" || custodyBlocked}'
)) {
    if ($actions -notmatch [regex]::Escape($must)) {
        Write-Host "X execute-button work incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
$mig = Get-Content -LiteralPath "supabase/migrations/20260723000007_v3_74_802_mandatory_custody_gates_execution.sql" -Raw
foreach ($must in @(
    "booking_mandatory_custody_gate",
    "EXECUTION_REQUIRES_MANDATORY_CUSTODY",
    "COALESCE(pbi.is_optional, false) = false"
)) {
    if ($mig -notmatch [regex]::Escape($must)) {
        Write-Host "X custody-gate migration incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ 801+802: button shows when legal, locks until mandatory custody is approved" -ForegroundColor Green

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
    "components/bookings/BookingActions.tsx" `
    "supabase/migrations/20260723000006_v3_74_800_decided_withdrawal_routes_to_booking.sql" `
    "supabase/migrations/20260723000007_v3_74_802_mandatory_custody_gates_execution.sql" `
    "push_v3.74.802.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.799.ps1" "push_v3.74.800.ps1" "push_v3.74.801.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_802.txt"
    $msgLines = @(
        'feat(bookings): v3.74.800-802 - decisions route home; execution waits for mandatory custody',
        '',
        'Three live catches from the owner''s booking-cycle test, one push:',
        '',
        '800 - withdrawal DECISION notifications route the executor to his',
        'BOOKING (id rides the event-key tail; the auto-void key now carries',
        'it too - DB fn updated on both DBs). The manager''s REQUEST',
        'notification keeps the approvals inbox.',
        '',
        '801 - the execute button''s condition was written around the broken',
        'confirm ("draft + stamped"), so fixing confirm (799) hid the button',
        'exactly when execution became legal. Executable = status confirmed,',
        'legacy stamped-draft tolerated.',
        '',
        '802 - owner rule: execution requires the store manager''s approval of',
        'every MANDATORY bundle item withdrawal (the system''s own rejection',
        'text already promised "the booking cannot run without it"). A shared',
        'gate fn (booking_mandatory_custody_gate) powers BOTH the DB guard in',
        'activate_booking_atomic (refuses, naming the missing items in',
        'Arabic) and the UI (button locks with the same names as a hint;',
        'fail-open reads - the server guard is the real gate). Optional items',
        'never gate. Rehearsed on the test copy: gate names the missing item,',
        'activate refuses, approval opens it.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.802 pushed - execution waits for the custodian's word" -ForegroundColor Green
}
