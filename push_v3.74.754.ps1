$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.753.ps1") { Remove-Item -LiteralPath "push_v3.74.753.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.754"') {
    Write-Host "+ 3.74.754" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.754]")) { Write-Host "X CHANGELOG missing [3.74.754]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$fx = Get-Content -LiteralPath "app/api/cron/fx-revaluation-reminder/route.ts" -Raw

# 'accounting' is not a permitted category. The allowed set is finance,
# inventory, sales, approvals, system, billing, hr, manufacturing,
# branch_activity, accountant_action.
if ($fx -match "category:\s*'accounting'") {
    Write-Host "X category 'accounting' is back - notifications_category_check rejects it" -ForegroundColor Red; exit 1
}
if ($fx -notmatch "category:\s*'finance'") {
    Write-Host "X the reminder no longer uses a permitted category" -ForegroundColor Red; exit 1
}
Write-Host "+ category is one the constraint accepts" -ForegroundColor Green

# NOT NULL columns the insert used to omit. reference_id is the one that raised.
foreach ($col in @('reference_id','kind','retry_count','created_by')) {
    if ($fx -notmatch "$col`:") {
        Write-Host "X the notification insert omits required column '$col'" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all required columns supplied" -ForegroundColor Green

# The root cause: an unchecked await. Without this the fix could regress and
# nobody would know, exactly as before.
if ($fx -notmatch "const \{ error: notifErr \}") {
    Write-Host "X the insert result is unchecked again - failures would be silent" -ForegroundColor Red; exit 1
}
if ($fx -notmatch "writeErrors") {
    Write-Host "X write failures are not collected" -ForegroundColor Red; exit 1
}
if ($fx -notmatch "status: 500") {
    Write-Host "X the cron still reports success when it delivered nothing" -ForegroundColor Red; exit 1
}
Write-Host "+ failures are collected and fail the run" -ForegroundColor Green

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }

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

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "app/api/cron/fx-revaluation-reminder/route.ts" `
    "push_v3.74.754.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.753.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_754.txt"
    $msgLines = @(
        'fix(cron): v3.74.754 - the FX revaluation reminder never delivered either',
        '',
        'Having fixed the integrity cron, I asked the same question of the rest:',
        'which scheduled jobs have ever left a trace? Backups, subscription',
        'renewal, booking reminders and accounting-period creation all have plenty.',
        'The FX revaluation reminder has none.',
        '',
        'A zero could simply mean no work to do, so I checked before concluding',
        'anything: this database holds 91 foreign-currency accounts across two base',
        'currencies. The reminder had real work and produced nothing for a month.',
        '',
        'Same shape as yesterday''s bug. category "accounting" is not in',
        'notifications_category_check; reference_id, kind, retry_count and',
        'created_by are NOT NULL and were never supplied; and the insert was',
        'awaited without checking its result, so every failure passed in silence.',
        '',
        'Confirmed by attempting the insert exactly as the cron sends it - rejected',
        'on reference_id - and then with the corrected shape, which passes. Category',
        'chosen by reading the constraint rather than guessing: FX revaluation is a',
        'finance concern, and "finance" is permitted.',
        '',
        'Which means the owner has never once been reminded to revalue foreign',
        'currency before closing a month.',
        '',
        'Errors are now collected and the run returns 500 if anything failed to',
        'deliver, rather than 200 with a cheerful count of zero.',
        '',
        'The generalisable point: five crons work, two were silent, and nobody',
        'could have known, because a job that fails and a job with nothing to do',
        'look identical from outside. The only thing that separates them is asking',
        '"did it leave a trace?" instead of "did it return success?".'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.754 pushed - both silent crons now speak" -ForegroundColor Green
}
