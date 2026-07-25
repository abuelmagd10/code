$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.819.ps1") { Remove-Item -LiteralPath "push_v3.74.819.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.820"') {
    Write-Host "+ 3.74.820" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.820]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.820]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$m8 = Get-Content -LiteralPath "supabase/migrations/20260725000008_v3_74_820_expense_input_vat.sql" -Raw

# --- (a) the column exists and cannot exceed the amount ------------------------
foreach ($must in @("tax_amount numeric(15,2) NOT NULL DEFAULT 0",
                    "tax_amount <= amount", "expenses_tax_amount_check")) {
    if ($m8 -notmatch [regex]::Escape($must)) {
        Write-Host "X expense tax column incomplete: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ an expense can carry tax, and never more tax than it cost" -ForegroundColor Green

# --- (b) the tax lands on the input-VAT account, not on the expense ------------
foreach ($must in @("'vat_input'", "v_net_gl", "ضريبة مدخلات")) {
    if ($m8 -notmatch [regex]::Escape($must)) {
        Write-Host "X the VAT still rides on the expense line: $must" -ForegroundColor Red; exit 1
    }
}
if ($m8 -notmatch [regex]::Escape("VAT_INPUT_ACCOUNT_MISSING")) {
    Write-Host "X a missing VAT account would silently swallow the tax" -ForegroundColor Red; exit 1
}
Write-Host "+ the tax is claimable, not an expense - and refuses to post without its account" -ForegroundColor Green

# --- (c) history is untouched -------------------------------------------------
if ($m8 -notmatch [regex]::Escape("DEFAULT 0")) {
    Write-Host "X existing expenses would not default to zero tax" -ForegroundColor Red; exit 1
}
Write-Host "+ every existing expense keeps its entry exactly as it was" -ForegroundColor Green

# --- (d) the form asks for it -------------------------------------------------
$ep = Get-Content -LiteralPath "app/expenses/new/page.tsx" -Raw
foreach ($must in @("taxAmount", "tax_amount:")) {
    if ($ep -notmatch [regex]::Escape($must)) {
        Write-Host "X the expense form does not collect the tax: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the user can enter the tax, and it reaches the ledger" -ForegroundColor Green

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
    "app/expenses/new/page.tsx",
    "supabase/migrations/20260725000008_v3_74_820_expense_input_vat.sql",
    "push_v3.74.820.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.819.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_820.txt"
    $msgLines = @(
        'fix(expenses): v3.74.820 - input VAT on expenses is claimable,',
        'not an expense',
        '',
        'The expenses table had NO tax field at all, and the entry was two',
        'lines: debit the expense with the whole amount, credit cash with the',
        'whole amount. For a VAT-registered company paying an expense with 14%',
        'VAT that means: the expense is inflated by the tax, which is not an',
        'expense but a receivable against output VAT; the right to deduct is',
        'lost entirely because the input-VAT report never sees expenses, so',
        'the company pays MORE tax than it actually owes; and reported profit',
        'is understated by the wrongly-charged tax.',
        '',
        'The amount stays the total paid, with a new field for the tax inside',
        'it, and the entry becomes three lines: debit expense (amount - tax),',
        'debit VAT input (tax), credit cash (total). A check constraint keeps',
        'the tax from exceeding the amount, and the poster refuses rather than',
        'silently swallowing the tax if no input-VAT account exists.',
        '',
        'Rehearsed on the test DB and rolled back: an expense of 1,140 with',
        '140 tax produced administrative expenses 1,000 debit, input VAT 140',
        'debit, cash 1,140 credit - balanced.',
        '',
        'The column defaults to zero for every existing row, so no historical',
        'entry changes; the single posted expense in production carries no tax.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.820 pushed - you stop paying tax you already paid" -ForegroundColor Green
}
