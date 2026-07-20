$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.746.ps1") { Remove-Item -LiteralPath "push_v3.74.746.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.747"') {
    Write-Host "+ 3.74.747" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.747]")) { Write-Host "X CHANGELOG missing [3.74.747]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$mig = "supabase/migrations/20260720000005_v3_74_747_assert_company_access_by_row.sql"
if (-not (Test-Path $mig)) { Write-Host "X migration file missing" -ForegroundColor Red; exit 1 }
$m = Get-Content -LiteralPath $mig -Raw

# The service_role escape hatch keeps every API route working.
if ($m -notmatch "IF auth\.uid\(\) IS NULL OR p_row_id IS NULL THEN") {
    Write-Host "X the row guard no longer exempts server-side calls - API routes would break" -ForegroundColor Red; exit 1
}
if ($m -notmatch "PERFORM public\.assert_company_access\(v_company\)") {
    Write-Host "X the row guard does not delegate to the membership check" -ForegroundColor Red; exit 1
}
Write-Host "+ row guard: server calls pass, membership actually checked" -ForegroundColor Green

# Each mapping must be a real table with the columns the guard reads. A wrong
# table silently guards the wrong thing - which is why these were read from each
# function's own body rather than guessed from its parameter name.
$pairs = [regex]::Matches($m, "\('([a-z_0-9]+)',\s*'([a-z_0-9]+)',\s*'(p_[a-z_]+)'\)")
if ($pairs.Count -ne 15) {
    Write-Host "X expected 15 function/table mappings, found $($pairs.Count)" -ForegroundColor Red; exit 1
}
$tables = $pairs | ForEach-Object { $_.Groups[2].Value } | Sort-Object -Unique
Write-Host "  $($pairs.Count) mappings across $($tables.Count) tables" -ForegroundColor DarkGray
Write-Host "+ mapping table intact" -ForegroundColor Green

# The patcher must raise rather than skip. Silent skipping is how three
# functions were missed in v3.74.730.
if ($m -notmatch "RAISE EXCEPTION 'no BEGIN found in %'") {
    Write-Host "X the patcher skips silently again" -ForegroundColor Red; exit 1
}
if ($m -notmatch "RAISE EXCEPTION 'function % not found'") {
    Write-Host "X the patcher would ignore a renamed function" -ForegroundColor Red; exit 1
}
Write-Host "+ patcher fails loudly on anything unexpected" -ForegroundColor Green

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }
if ($testsLine -match "(\d+)\s+passed" -and [int]$Matches[1] -gt 60) {
    Write-Host "X $($Matches[1]) passed, expected ~50" -ForegroundColor Red; exit 1
}
Write-Host "+ critical tests as expected" -ForegroundColor Green

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

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

git add -- "lib/version.ts" "CHANGELOG.md" "$mig" "push_v3.74.747.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.746.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_747.txt"
    $msgLines = @(
        'security: v3.74.747 - the live path is sound, 15 ledger functions guarded',
        '',
        'First, the item I had refused to judge. confirm_purchase_return_delivery_v2',
        'deletes journal entry lines and rewrites them, and I could not tell whether',
        'the entry might already be posted. Traced it: the function loads the return',
        'FOR UPDATE and raises unless workflow_status is still pending_warehouse or',
        'pending_approval. A second call fails three thousand characters before the',
        'DELETE. So the entry being rebuilt is a draft by definition, and the delete',
        'is a line rebuild rather than the destruction of history. Confirmed against',
        'the data too: no pending return carries a posted journal entry.',
        '',
        'I had missed that guard because I searched for "status" and',
        '"delivery_status"; the column is workflow_status. Eleventh instance of the',
        'same habit - and the reason I declined to call it broken at the time.',
        '',
        'Second, the row-id class. 15 functions that touch the ledger - among them',
        'record_payment, execute_sales_invoice_accounting, post_payroll_run_atomic',
        'and create_reversal_entry - now check membership through',
        'assert_company_access_by_row(table, row_id), which resolves the owning',
        'company from the row before delegating to the existing check.',
        '',
        'How each table was determined is the part worth keeping. My first attempt',
        'derived it from the parameter name by pluralising: p_asset_id gave',
        '"assets", p_schedule_id gave "schedules". 29 of 48 resolved to tables that',
        'do not exist. Guessing from names is exactly the habit that created the',
        'blind spot this work exists to close, so I read each table out of the',
        'function''s own body instead - the statement where it loads its row. 15 of',
        'the 19 declare it that way and are guarded here. The remaining 4 load their',
        'data differently and are left for individual review rather than guessed at.',
        '',
        'All 11 tables were confirmed to carry id and company_id before anything was',
        'written. Verified by execution on a real invoice: server-side call allowed,',
        'member allowed, user from another company rejected.',
        '',
        'Counter: 48 to 33 - 4 ledger-touching ones needing individual review, and',
        '29 that do not touch the ledger.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.747 pushed - 15 ledger functions now check membership" -ForegroundColor Green
}
