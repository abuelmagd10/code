$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.797.ps1") { Remove-Item -LiteralPath "push_v3.74.797.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.798"') {
    Write-Host "+ 3.74.798" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.798]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.798]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- customers follow the selected branch, positively asserted ------------------
$form = Get-Content -LiteralPath "components/bookings/BookingForm.tsx" -Raw
foreach ($must in @(
    "const visibleCustomers = isFloatingBookingOfficer && watchedBranchId",
    "customers.filter((c) => !c.branch_id || c.branch_id === watchedBranchId)",
    'form.setValue("customer_id", "")',
    "customers={visibleCustomers}"
)) {
    if ($form -notmatch [regex]::Escape($must)) {
        Write-Host "X branch-scoped customer dropdown incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
$page = Get-Content -LiteralPath "app/bookings/new/page.tsx" -Raw
if ($page -notmatch [regex]::Escape('"id, name, phone, branch_id"')) {
    Write-Host "X the customers query no longer fetches branch_id" -ForegroundColor Red; exit 1
}
Write-Host "+ booking customers follow the selected branch (like services)" -ForegroundColor Green

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
    "components/bookings/BookingForm.tsx" `
    "app/bookings/new/page.tsx" `
    "push_v3.74.798.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.797.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_798.txt"
    $msgLines = @(
        'fix(bookings): v3.74.798 - the customer dropdown follows the selected branch',
        '',
        'Owner observation opening scenario 1 of the booking live test: a',
        'floating booking officer (no branch binding) picks the branch first,',
        'but the customer list still showed EVERY branch''s customers - a',
        'wrong-branch pick only died at submit, on the raw',
        'CUSTOMER_BRANCH_ISOLATION guard, after the whole form was filled.',
        '',
        'The services rule now applies to customers too: pick the branch',
        'first, see that branch''s customers (plus unassigned ones, which the',
        'DB guard accepts); changing branches clears the customer selection',
        'like it clears the service; hint text updated. Branch-bound roles',
        'keep their already page-scoped lists. The DB isolation guard stays',
        'as the last line of defence.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.798 pushed - the branch decides who appears in the list" -ForegroundColor Green
}
