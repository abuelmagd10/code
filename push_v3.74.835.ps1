$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.834.ps1") { Remove-Item -LiteralPath "push_v3.74.834.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.835"') {
    Write-Host "+ 3.74.835" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.835]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.835]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$mig = "supabase/migrations/20260726000005_v3_74_835_no_uncostable_routing.sql"
$files = @("lib/version.ts", "CHANGELOG.md", $mig, "docs/HANDOVER_2026-07-24.md", "push_v3.74.835.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.834.ps1" 2>$null

$m = Get-Content -LiteralPath $mig -Raw

# --- both halves of the gap are refused ---------------------------------------
# (a) rated work centre + zero-time operation  (order 29)
if ($m -notmatch [regex]::Escape("+ COALESCE(ro.labor_time_minutes,0) + COALESCE(ro.machine_time_minutes,0)) = 0")) {
    Write-Host "X the zero-TIME case is not detected - order 29's bug could recur" -ForegroundColor Red; exit 1
}
# (b) work centre with every rate at zero      (order 28)
if ($m -notmatch [regex]::Escape("+ COALESCE(wc.variable_overhead_rate,0) + COALESCE(wc.fixed_overhead_rate,0)) = 0")) {
    Write-Host "X the zero-RATE case is not detected - order 28's bug could recur" -ForegroundColor Red; exit 1
}
Write-Host "+ both halves refused: zero time with rates, and zero rates" -ForegroundColor Green

# --- and the guard is actually CALLED, not merely defined ---------------------
$calls = ([regex]::Matches($m, [regex]::Escape("PERFORM public.mr_assert_routing_operations_costable(NEW.id);"))).Count
if ($calls -lt 2) {
    Write-Host "X the costability guard is called $calls time(s) - expected approval AND activation" -ForegroundColor Red; exit 1
}
Write-Host "+ the guard runs on approval and on activation ($calls call sites)" -ForegroundColor Green

# --- messages name the operation and the work centre, not "check settings" ----
foreach ($needle in @("v_bad.operation_no, v_bad.operation_name, v_bad.wc_code, v_bad.wc_name",
                      "v_bad.wc_code, v_bad.wc_name, v_bad.operation_no, v_bad.operation_name")) {
    if ($m -notmatch [regex]::Escape($needle)) {
        Write-Host "X a guard message does not name the offending operation/work centre" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the refusals name the operation and the work centre" -ForegroundColor Green

# --- the mis-pointed control account cannot be set again ---------------------
if ($m -notmatch [regex]::Escape("CREATE TRIGGER trg_companies_manufacturing_accounts_guard")) {
    Write-Host "X the control-account guard is not installed - wages could point at loans again" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("IN ('wages_payable', 'accrued_salaries', 'direct_labour_applied')")) {
    Write-Host "X the wages account nature check is missing" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("SET wages_payable_account_id = NULL")) {
    Write-Host "X the bogus wages override is not cleared from existing data" -ForegroundColor Red; exit 1
}
Write-Host "+ control accounts must match their nature, and the bad one is cleared" -ForegroundColor Green

# --- every guard message bilingual -------------------------------------------
$cv = ([regex]::Matches($m, [regex]::Escape("check_violation"))).Count
if ($cv -lt 6) { Write-Host "X only $cv guard messages carry check_violation (expected 6+)" -ForegroundColor Red; exit 1 }
Write-Host "+ $cv bilingual guard messages" -ForegroundColor Green

Write-Host "Verifying the migration files match the live database..." -ForegroundColor Cyan
node scripts/check-migration-matches-db.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X migration/database divergence - NOT pushing" -ForegroundColor Red; exit 1 }

Write-Host "Verifying the lockfile matches package.json..." -ForegroundColor Cyan
node scripts/check-lockfile-in-sync.js
if ($LASTEXITCODE -ne 0) { Write-Host "X lockfile check failed" -ForegroundColor Red; exit 1 }

Write-Host "Verifying referenced scripts and their inputs are committed..." -ForegroundColor Cyan
node scripts/check-referenced-scripts-tracked.js
if ($LASTEXITCODE -ne 0) { Write-Host "X referenced-scripts check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column writes..." -ForegroundColor Cyan
node scripts/check-phantom-columns.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-column check failed" -ForegroundColor Red; exit 1 }

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

git add -- $files 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

# read the STAGED blob as one string (834's lesson: -notmatch on an array lies)
$stagedBlob = (git show ":$mig" 2>$null | Out-String)
if ([string]::IsNullOrWhiteSpace($stagedBlob)) {
    Write-Host "X the migration is NOT staged" -ForegroundColor Red; exit 1
}
if (-not $stagedBlob.Contains("mr_assert_routing_operations_costable")) {
    Write-Host "X the staged migration is not the one verified" -ForegroundColor Red; exit 1
}
Write-Host "+ the staged blob is the verified migration" -ForegroundColor Green

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_835.txt"
    $msgLines = @(
        'fix(manufacturing): v3.74.835 - conversion cost is time x rate, and the',
        'system accepted either one missing',
        '',
        'Live test 1 completed: the materials were right and the conversion cost',
        'was zero. The motorcycle entered stock at 60.00 instead of 118.50, and',
        'the journal description said so itself - "materials only".',
        '',
        'The two orders are mirror images of one gap:',
        '',
        '  order 28, WC-01: 60 minutes of time, every cost rate at zero',
        '  order 29, WC-02: rates of 100/3/4/10, zero time',
        '',
        'Either way the conversion cost is zero. The system accepted the absence',
        'of either factor without a word and carried the order through four gates',
        '- saving the routing, approving it, releasing the order, receiving the',
        'output - until the product was capitalised understated. Under IAS 2 that',
        'means finished goods below cost, labour and overhead never absorbed, and',
        'an overstated profit on sale. Which already happened: order 28s output',
        'was sold at a cost of 60.',
        '',
        'The refusal belongs at APPROVAL, because approval is the moment a',
        'standard is adopted. Three cases are now refused by name - operation',
        'number, operation name, work centre code and work centre name:',
        'a zero-time operation at a rated work centre; a work centre with every',
        'rate at zero; a routing with no operations. Checked on activation too.',
        '',
        'A second landmine surfaced during the investigation:',
        'companies.wages_payable_account_id pointed at account 2210, LONG-TERM',
        'LOANS. It had not detonated only because the resolver prefers',
        'direct_labour_applied (5415) over the company override - so had 5415 been',
        'absent, production wages would have been credited to long-term loans and',
        'the debt would have inflated with every production order. It was found',
        'BEFORE conversion cost ran for the first time, so nothing was ever',
        'mis-posted. A mis-pointed control account does not fail once; it fails in',
        'every entry that passes through it. A guard now refuses to point any of',
        'the three manufacturing control accounts at an account whose nature does',
        'not match, and the bad override is cleared.',
        '',
        'Data repair, per the owners decision: JE-000067 debits inventory 58.50',
        'and credits applied labour 50.00 and applied overhead 8.50, and the FIFO',
        'lot moves from 60.00 to 118.50. The amounts are DERIVED from WC-02s rates',
        'over half an hour, not typed in. Order 28 is deferred until WC-01 has',
        'rates - a cost cannot be corrected without a known rate.',
        '',
        'Verified after the repair: trial balance 0.00, WIP 0.00, zero live',
        'drafts, inventory ledger 199.27 against FIFO 199.269 - a 0.00098',
        'difference from fractional unit costs in earlier lots, not from this',
        'entry.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.835 pushed - a standard that costs nothing cannot be approved" -ForegroundColor Green
}
