$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.816.ps1") { Remove-Item -LiteralPath "push_v3.74.816.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.817"') {
    Write-Host "+ 3.74.817" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.817]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.817]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$m5 = Get-Content -LiteralPath "supabase/migrations/20260725000005_v3_74_817_payroll_gross_and_deduction_liabilities.sql" -Raw

# --- (a) the gate that made payroll postable at all ----------------------------
if ($m5 -notmatch [regex]::Escape("set_config('app.allow_direct_post', 'true', true)")) {
    Write-Host "X payroll still cannot post - the direct-post gate is missing" -ForegroundColor Red; exit 1
}
if ($m5 -notmatch [regex]::Escape("set_config('app.allow_direct_post', 'false', true)")) {
    Write-Host "X the gate is opened but never closed" -ForegroundColor Red; exit 1
}
Write-Host "+ payroll can post, and the gate closes behind it" -ForegroundColor Green

# --- (b) the entry is GROSS, with every deduction landing on a liability -------
foreach ($must in @("v_gross", "v_advances", "v_insurance", "v_other_deductions",
                    "'1170'", "'2135'", "'2125'")) {
    if ($m5 -notmatch [regex]::Escape($must)) {
        Write-Host "X payroll entry incomplete: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ salary expense is gross; advances, insurance and taxes each get a line" -ForegroundColor Green

# --- (c) balance is proven before posting, never after -------------------------
if ($m5 -notmatch [regex]::Escape("PAYSLIP_IMBALANCE")) {
    Write-Host "X nothing stops a broken payslip from posting a deformed entry" -ForegroundColor Red; exit 1
}
Write-Host "+ a payslip that does not add up is refused, not posted" -ForegroundColor Green

# --- (d) the expense carries the employee's branch -----------------------------
if ($m5 -notmatch [regex]::Escape("GROUP BY e.branch_id")) {
    Write-Host "X wages would still be invisible in branch profitability" -ForegroundColor Red; exit 1
}
Write-Host "+ wages reach branch profitability" -ForegroundColor Green

# --- (e) the legacy unbalanced poster is disarmed ------------------------------
if ($m5 -notmatch [regex]::Escape("DEPRECATED_PAYROLL_POSTER")) {
    Write-Host "X the legacy unbalanced payroll poster is still loaded" -ForegroundColor Red; exit 1
}
Write-Host "+ the loaded gun is unloaded" -ForegroundColor Green

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
    "supabase/migrations/20260725000005_v3_74_817_payroll_gross_and_deduction_liabilities.sql",
    "push_v3.74.817.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.816.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_817.txt"
    $msgLines = @(
        'fix(payroll): v3.74.817 - payroll could never post, and its entry',
        'was net-of-deductions instead of gross',
        '',
        'The most consequential finding of the module review: it repeats for',
        'every employee, every month.',
        '',
        '(1) post_payroll_atomic inserted the journal entry without opening',
        '    the direct-post gate, so enforce_je_integrity refused it with',
        '    DIRECT_POST_BLOCKED. Proof: ZERO payroll_payment entries exist in',
        '    production despite existing payslips. Payroll payment has never',
        '    succeeded, in any company. Sibling atomic functions open the gate',
        '    inside their transaction; this one was overlooked.',
        '',
        '(2) The entry was two lines - debit salary expense = NET, credit cash',
        '    = NET - which a trial balance can never catch because it balances.',
        '    Three consequences: salary expense understated by every deduction;',
        '    the company''s obligations for withheld insurance and tax never',
        '    appeared on the balance sheet; and a recovered employee advance',
        '    was never settled against the advances asset, leaving a phantom',
        '    receivable. No branch_id either, so wages - usually the largest',
        '    expense - were invisible in branch profitability.',
        '',
        'The entry now: debit salary expense GROSS split by each employee''s',
        'branch; credit employee advances, accrued insurance (new account',
        '2135, seeded into all companies), other withholdings, and cash for',
        'the net. Balanced by construction, and a payslip whose gross does not',
        'equal net plus deductions is refused with a bilingual message rather',
        'than posted deformed.',
        '',
        'Rehearsed live on the test DB with a 10,000 gross payslip carrying a',
        '1,000 advance, 1,200 insurance and 500 withholding: debit 10,000,',
        'credit 10,000, every deduction on its own account.',
        '',
        'post_payroll_run_atomic - whose own body admits "SIMPLIFICATION: We',
        'Don''t handle Deductions logic deeply here" and debits earnings while',
        'crediting net - is disarmed with a clear message pointing at the',
        'correct path.',
        '',
        'Data: all four production payslips carry zero deductions and had no',
        'entry posted, so nothing historical needs correcting. This fix is',
        'entirely preventive, landing before the first real payroll run.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.817 pushed - payroll posts, and it posts the truth" -ForegroundColor Green
}
