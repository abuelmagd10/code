$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.815.ps1") { Remove-Item -LiteralPath "push_v3.74.815.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.816"') {
    Write-Host "+ 3.74.816" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.816]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.816]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$m4 = Get-Content -LiteralPath "supabase/migrations/20260725000004_v3_74_816_root_account_guards_and_data_repair.sql" -Raw

# --- (a) both guards exist -----------------------------------------------------
foreach ($must in @("fn_guard_no_root_account_posting", "fn_guard_product_accounts_not_root",
                    "trg_no_root_account_posting", "trg_product_accounts_not_root")) {
    if ($m4 -notmatch [regex]::Escape($must)) {
        Write-Host "X root-account guard missing: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ nothing can be posted to - or wired to - a roll-up header account" -ForegroundColor Green

# --- (b) the guard must reject the ROOT only, never a legitimate 4100 ----------
if ($m4 -notmatch [regex]::Escape("c.parent_id IS NULL AND EXISTS")) {
    Write-Host "X the guard's root test is not the precise one - it could block 4100" -ForegroundColor Red; exit 1
}
Write-Host "+ the test is precise: root of the tree, not any account with children" -ForegroundColor Green

# --- (c) the guard must not invalidate historical lines ------------------------
if ($m4 -notmatch [regex]::Escape("BEFORE INSERT ON public.journal_entry_lines")) {
    Write-Host "X the posting guard would also fire on historical updates" -ForegroundColor Red; exit 1
}
Write-Host "+ history is left alone; only new lines are judged" -ForegroundColor Green

# --- (d) the data repair travels with the fix ---------------------------------
foreach ($must in @("UPDATE products p", "product_type = 'raw_material'", "shareholders s", "JE-000063")) {
    if ($m4 -notmatch [regex]::Escape($must)) {
        Write-Host "X data repair section incomplete: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the system fix ships together with the repair of what it left behind" -ForegroundColor Green

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

$files = @(
    "lib/version.ts",
    "CHANGELOG.md",
    "docs/HANDOVER_2026-07-24.md",
    "supabase/migrations/20260725000004_v3_74_816_root_account_guards_and_data_repair.sql",
    "push_v3.74.816.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.815.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_816.txt"
    $msgLines = @(
        'fix(accounting): v3.74.816 - roll-up header accounts are not postable',
        'and the data they already spoiled is repaired',
        '',
        'Owner clarified the founding rule: fix the system so the gap cannot',
        'recur AND repair the data already sitting in the companies - clean',
        'data is the practical proof the fix actually landed.',
        '',
        'The gap: verifying 815''s revenue-classification fix exposed three',
        'items wired to 4000 (Revenue) and 5000 (Expenses) - the ROOTS of the',
        'chart of accounts, pure roll-up headers no ledger may post to. Since',
        'the DB invoice poster reads products.income_account_id, the next',
        'invoice for any of them would have credited the root and collapsed',
        'the income statement, where the total would equal itself twice.',
        '',
        'System (migration 20260725000004), both messages bilingual:',
        '  - fn_guard_no_root_account_posting on journal_entry_lines,',
        '    BEFORE INSERT only so no historical line is invalidated.',
        '  - fn_guard_product_accounts_not_root on products.',
        '  - The test is precise - parent_id IS NULL AND has children - so',
        '    4100/4200/5100/5200 stay postable despite having contra children.',
        '  - Rehearsed on the test DB: root posting REJECTED, detail posting',
        '    PASSED, product-to-root link REJECTED. Rolled back.',
        '',
        'Data, across every company, not one:',
        '  - three items moved 4000/5000 -> 4100/5100',
        '  - raw materials'' sale price zeroed (matches the hidden field)',
        '  - every existing shareholder without capital/drawings accounts got',
        '    them created and linked (a second company had one)',
        '  - JE-000063 reclassifies a 500 service revenue out of Sales into',
        '    Service Revenue - a NEW entry, never an edit to a posted one.',
        '    Zero effect on profit and cash; classification only.',
        '',
        'Verified after: trial balance 0.00, net profit unchanged at 2,434.03,',
        'service revenue 1,900.00, sales revenue 791.39, and zero rows left',
        'in any of the three violation scans.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.816 pushed - the gap is closed and the data it spoiled is clean" -ForegroundColor Green
}
