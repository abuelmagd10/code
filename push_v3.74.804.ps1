$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.803.ps1") { Remove-Item -LiteralPath "push_v3.74.803.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.804"') {
    Write-Host "+ 3.74.804" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.804]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.804]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the zombie triggers are gone for good, positively asserted -----------------
$mig = Get-Content -LiteralPath "supabase/migrations/20260723000009_v3_74_804_drop_zombie_accrual_triggers.sql" -Raw
foreach ($must in @(
    "DROP TRIGGER IF EXISTS trg_accrual_invoice",
    "DROP TRIGGER IF EXISTS trg_accrual_invoices",
    "DROP TRIGGER IF EXISTS trg_invoice_sent_accrual"
)) {
    if ($mig -notmatch [regex]::Escape($must)) {
        Write-Host "X zombie-trigger drop migration incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ the three legacy accrual triggers are dropped, not merely disabled" -ForegroundColor Green

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
    "supabase/migrations/20260723000009_v3_74_804_drop_zombie_accrual_triggers.sql" `
    "push_v3.74.804.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.803.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_804.txt"
    $msgLines = @(
        'fix(db): v3.74.804 - the zombie accrual triggers are dropped for good',
        '',
        'Honest root cause: the v3.74.796 backfill ended with ALTER TABLE',
        'invoices ENABLE TRIGGER USER - which re-arms EVERY user trigger,',
        'including three legacy naive accrual triggers that were deliberately',
        'DISABLED long ago. The resurrected accrual_invoice_accounting fired',
        'on the booking invoice''s draft->sent update during completion,',
        'attempted a direct journal INSERT, and enforce_je_integrity rightly',
        'blocked it (DIRECT_POST_BLOCKED) - live-caught by the owner on',
        'BKG-2026-00007. It would also have killed any post-rejection re-send',
        '(also draft->sent). No data damage: the block aborted atomically.',
        '',
        'Lesson: disabled-by-design is a landmine for every future',
        'ENABLE TRIGGER USER. The three are superseded (naive math - no',
        'discounts, no inclusive pricing, no shipping tax; the real journal',
        'paths are the atomic executors and execute_sales_invoice_accounting).',
        'DROPPED on test + prod; verified afterwards: ZERO non-enabled',
        'triggers remain anywhere - no more landmines of this class.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.804 pushed - dead code stays dead" -ForegroundColor Green
}
