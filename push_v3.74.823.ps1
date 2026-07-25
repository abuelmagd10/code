$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.822.ps1") { Remove-Item -LiteralPath "push_v3.74.822.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.823"') {
    Write-Host "+ 3.74.823" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.823]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.823]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$m11 = Get-Content -LiteralPath "supabase/migrations/20260725000011_v3_74_823_labour_applied_not_payable.sql" -Raw

# --- (a) the applied-labour account exists for every company ------------------
foreach ($must in @("'5415'", "direct_labour_applied")) {
    if ($m11 -notmatch [regex]::Escape($must)) {
        Write-Host "X applied-labour account missing: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ production labour is absorbed, not owed twice" -ForegroundColor Green

# --- (b) the code prefers it over the liability -------------------------------
$ma = Get-Content -LiteralPath "lib/manufacturing/manufacturing-accounting.ts" -Raw
if ($ma -notmatch [regex]::Escape('bySubType("direct_labour_applied")')) {
    Write-Host "X manufacturing still credits a liability for wages" -ForegroundColor Red; exit 1
}
if ($ma -notmatch [regex]::Escape("أجور محمَّلة على الإنتاج (استيعاب فى تكلفة المنتج)")) {
    Write-Host "X the journal line still calls it 'payable'" -ForegroundColor Red; exit 1
}
Write-Host "+ the ledger says 'applied', because that is what it is" -ForegroundColor Green

# --- (c) every NEW company gets the four accounts -----------------------------
foreach ($must in @("chart_of_accounts_template", "'2135'", "'2136'", "'5215'")) {
    if ($m11 -notmatch [regex]::Escape($must)) {
        Write-Host "X new companies would be born missing: $must" -ForegroundColor Red; exit 1
    }
}
$seed = Get-Content -LiteralPath "lib/default-chart-of-accounts.ts" -Raw
foreach ($must in @("'2135'", "'2136'", "'5215'")) {
    if ($seed -notmatch [regex]::Escape($must)) {
        Write-Host "X the seed file is missing: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ a company created tomorrow is born with today's accounts" -ForegroundColor Green

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
    "lib/default-chart-of-accounts.ts",
    "lib/manufacturing/manufacturing-accounting.ts",
    "supabase/migrations/20260725000011_v3_74_823_labour_applied_not_payable.sql",
    "push_v3.74.823.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.822.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_823.txt"
    $msgLines = @(
        'fix(manufacturing,coa): v3.74.823 - production labour is APPLIED,',
        'not payable, and new companies inherit today''s accounts',
        '',
        'The finished-goods entry credited direct labour to "Accrued Salaries',
        '2130" - a fresh liability - while payroll charges the same wages in',
        'full to Salaries 5210 and pays them in cash. Two defects at once:',
        'labour counted TWICE (once as expense, once inside inventory value),',
        'and a permanent phantom liability that grows with every production',
        'order and has no settlement path - the company appearing to owe its',
        'staff money it has already paid.',
        '',
        'Standard applied-labour treatment instead: a contra-expense account,',
        '5415 Direct Labour Applied, exactly parallel to the 5410',
        'Manufacturing Overhead Applied account the chart already ships. Net',
        'wage expense falls by whatever was absorbed into inventory value; no',
        'double count, no phantom liability, and the gap between wages paid',
        'and wages absorbed stays visible in 5210 as a labour variance, which',
        'is precisely where it belongs.',
        '',
        'Account resolution prefers sub_type direct_labour_applied then code',
        '5415, keeping the old chain as a last resort so a company that',
        'deliberately configured wages_payable_account_id is not broken.',
        '',
        'CHART TEMPLATE: today''s releases created their accounts for existing',
        'companies only. Without the template, every NEW company would be born',
        'without accrued insurance (817), accrued commissions and commission',
        'expense (822) and applied labour (823) - hitting a wall at its first',
        'payroll, first commission or first production order. All four are now',
        'in the template AND in the seed file.',
        '',
        'Data: not one line was ever posted to 2130 from manufacturing in any',
        'company - the work centres carried zero rates - so nothing needs',
        'correcting. Entirely preventive.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.823 pushed - labour is absorbed once, and new companies start complete" -ForegroundColor Green
}
