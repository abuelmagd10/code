$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.804.ps1") { Remove-Item -LiteralPath "push_v3.74.804.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.805"') {
    Write-Host "+ 3.74.805" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.805]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.805]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the gate is locked; the accountant lands on the invoice; the chip is true --
$mig = Get-Content -LiteralPath "supabase/migrations/20260723000010_v3_74_805_custody_gate_locked_down.sql" -Raw
foreach ($must in @(
    "REVOKE EXECUTE ON FUNCTION public.booking_mandatory_custody_gate(uuid) FROM anon",
    "assert_company_access_by_row('bookings', p_booking_id)"
)) {
    if ($mig -notmatch [regex]::Escape($must)) {
        Write-Host "X gate-lockdown migration incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
$svc = Get-Content -LiteralPath "lib/services/booking-notification.service.ts" -Raw
if ($svc -notmatch [regex]::Escape('referenceType: ctx.invoice_id ? "invoice" : "booking"')) {
    Write-Host "X the accountant completion notification still references the booking" -ForegroundColor Red; exit 1
}
$page = Get-Content -LiteralPath "app/invoices/page.tsx" -Raw
if ($page -notmatch [regex]::Escape("String((row as any).warehouse_status || (row as any).approval_status || '')")) {
    Write-Host "X the delivery chip still prefers approval_status" -ForegroundColor Red; exit 1
}
Write-Host "+ gate locked (anon revoked + caller check); accountant lands on the invoice; chip reads warehouse_status" -ForegroundColor Green

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
    "lib/services/booking-notification.service.ts" `
    "app/invoices/page.tsx" `
    "supabase/migrations/20260723000010_v3_74_805_custody_gate_locked_down.sql" `
    "push_v3.74.805.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.804.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_805.txt"
    $msgLines = @(
        'fix(security+ux): v3.74.805 - the checker catches our own new gate; two owner catches',
        '',
        'The integrity board''s FIRST real security finding since going clean:',
        'ic_anon_reachable_readers flagged booking_mandatory_custody_gate',
        '(born in 802) - SECURITY DEFINER with Postgres''s default PUBLIC',
        'execute, company-scoped reads, no caller check. Locked down: EXECUTE',
        'revoked from PUBLIC/anon (authenticated only) plus an',
        'assert_company_access_by_row caller check inside. Verified: the',
        'checker reports zero anon-reachable readers again. The checker',
        'infrastructure proved itself on our own code.',
        '',
        'Owner catches from the live booking test:',
        '- the booking-completed notification routed the ACCOUNTANT to the',
        '  dashboard: it referenced the booking, a page outside his role. It',
        '  now references the INVOICE - his workspace - and lands there.',
        '- the invoice list showed "awaiting delivery approval" on an',
        '  approved invoice: the chip preferred approval_status (stuck at its',
        '  pending default on booking-born invoices) over warehouse_status,',
        '  the authoritative dispatch state. Priority inverted.',
        '  (The "full return" the owner read as a status chip is actually a',
        '  legitimate action button.)'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.805 pushed - the watchman caught the locksmith" -ForegroundColor Green
}
