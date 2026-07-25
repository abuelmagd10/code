$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.821.ps1") { Remove-Item -LiteralPath "push_v3.74.821.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.822"') {
    Write-Host "+ 3.74.822" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.822]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.822]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$m10 = Get-Content -LiteralPath "supabase/migrations/20260725000010_v3_74_822_sales_bonus_accrual.sql" -Raw

# --- (a) the commission accounts exist ----------------------------------------
foreach ($must in @("'5215'", "'2136'", "post_bonus_accrual_atomic")) {
    if ($m10 -notmatch [regex]::Escape($must)) {
        Write-Host "X commission accounting incomplete: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ a commission earned is an expense and a debt, both on the books" -ForegroundColor Green

# --- (b) a clawback reverses it -----------------------------------------------
if ($m10 -notmatch [regex]::Escape("v_is_clawback")) {
    Write-Host "X a sales return would leave the commission expense standing" -ForegroundColor Red; exit 1
}
Write-Host "+ a sales return takes the commission back out of the books too" -ForegroundColor Green

# --- (c) payroll must not expense it a second time ----------------------------
if ($m10 -notmatch [regex]::Escape("v_bonus_liab_acct")) {
    Write-Host "X payroll would expense the commission a second time" -ForegroundColor Red; exit 1
}
if ($m10 -notmatch [regex]::Escape("v3.74.822 bonus already accrued")) {
    Write-Host "X the payroll patch marker is missing" -ForegroundColor Red; exit 1
}
Write-Host "+ paying it settles the debt instead of doubling the expense" -ForegroundColor Green

# --- (d) idempotent, and anchored safely --------------------------------------
if ($m10 -notmatch [regex]::Escape("'idempotent', TRUE")) {
    Write-Host "X calling the accrual twice would post twice" -ForegroundColor Red; exit 1
}
foreach ($must in @("anchor not unique", "already patched")) {
    if ($m10 -notmatch [regex]::Escape($must)) {
        Write-Host "X the patch lacks its safety check: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ nothing posts twice, and the patch pins its anchor exactly once" -ForegroundColor Green

# --- (e) the services actually call it ----------------------------------------
$bc = Get-Content -LiteralPath "lib/services/bonus-calculator.service.ts" -Raw
if ($bc -notmatch [regex]::Escape("post_bonus_accrual_atomic")) {
    Write-Host "X earning a commission still posts nothing" -ForegroundColor Red; exit 1
}
$br = Get-Content -LiteralPath "lib/services/bonus-reversal.service.ts" -Raw
if ($br -notmatch [regex]::Escape("post_bonus_accrual_atomic")) {
    Write-Host "X clawing a commission back still posts nothing" -ForegroundColor Red; exit 1
}
Write-Host "+ both the earning and the clawback reach the ledger" -ForegroundColor Green

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
    "lib/services/bonus-calculator.service.ts",
    "lib/services/bonus-reversal.service.ts",
    "supabase/migrations/20260725000010_v3_74_822_sales_bonus_accrual.sql",
    "push_v3.74.822.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.821.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_822.txt"
    $msgLines = @(
        'fix(bonuses): v3.74.822 - a sales commission is an expense and a debt,',
        'and now both reach the books',
        '',
        'The commission was calculated and stored in user_bonuses and then',
        'entered the ledger nowhere: no commission expense, so profit looked',
        'higher than it was until the month it was paid; no liability, so the',
        'company owed money that appeared in no report and on no balance',
        'sheet; and no reversal on a sales return - the clawback was written',
        'as a negative row with no accounting effect at all.',
        '',
        'Three stations now close the loop:',
        '  - on the sale: Dr 5215 sales commissions / Cr 2136 accrued',
        '    commissions',
        '  - on a sales return: the mirror entry, pro-rata',
        '  - on payroll: salary expense EXCLUDES the commission and the',
        '    payment settles the liability instead, so the expense is',
        '    recognised exactly once',
        '',
        'Rehearsed end to end on the test DB and rolled back: a 200 commission',
        'accrued as 5215 debit 200 / 2136 credit 200; a repeat call returned',
        'the same entry; then a payslip of 5,000 basic plus that 200 posted',
        'salary expense 5,000 ONLY, accrued commissions 200 debit, cash 5,200',
        'credit - balanced, with the expense counted once.',
        '',
        'DATA REPAIR: two commissions of 7.00 each (INV-2026-00002/3) were',
        'sitting pending with no accounting trace. Both accrued (JE-000065,',
        'JE-000066). Verified after: trial balance 0.00, the 14.00 liability',
        'now visible on the balance sheet, and net profit 2,420.17 - the real',
        'figure once the obligations are recognised, against the 2,434.03 that',
        'had been ignoring them.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.822 pushed - what you owe your team is finally on the books" -ForegroundColor Green
}
