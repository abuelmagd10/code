$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.704.ps1") { Remove-Item -LiteralPath "push_v3.74.704.ps1" -Force }
# v3.74.703's script may still be tracked from an earlier release.
if (Test-Path "push_v3.74.703.ps1") { Remove-Item -LiteralPath "push_v3.74.703.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.705"') {
    Write-Host "+ 3.74.705" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.705]")) { Write-Host "X CHANGELOG missing [3.74.705]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

Write-Host "Dumping DB functions..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump-db-functions failed" -ForegroundColor Red; exit 1 }

$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw

if ($fn -notmatch "fn_post_service_consumption_cogs") {
    Write-Host "X the service-consumption costing function is missing from the DB dump" -ForegroundColor Red; exit 1
}
Write-Host "+ service-consumption costing function present" -ForegroundColor Green

# Both callers must be wired: the execution path and the resync path.
if ($fn -notmatch "fn_post_service_consumption_cogs\(p_company_id, v_invoice_id\)") {
    Write-Host "X complete_booking_atomic does not cost the consumption" -ForegroundColor Red; exit 1
}
if ($fn -notmatch "fn_post_service_consumption_cogs\(p_company_id, v_invoice\.id\)") {
    Write-Host "X resync_booking_invoice does not cost the consumption" -ForegroundColor Red; exit 1
}
Write-Host "+ both execution and resync paths cost the consumption" -ForegroundColor Green

# The resync call must sit before the FINAL return, not inside the early-exit
# guard - that mistake was made once and must not come back silently.
$resyncIdx = $fn.IndexOf("fn_post_service_consumption_cogs(p_company_id, v_invoice.id)")
$guardIdx  = $fn.IndexOf("'booking_not_completed'")
if ($guardIdx -ge 0 -and $resyncIdx -lt $guardIdx) {
    Write-Host "X the resync costing call sits before the early-exit guard" -ForegroundColor Red; exit 1
}
Write-Host "+ resync costing call is correctly placed" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
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
    "supabase/migrations/20260719000705_v3_74_705_cost_service_consumption.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.705.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.704.ps1" "push_v3.74.703.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_705.txt"
    $msgLines = @(
        'fix(accounting): v3.74.705 - cost the materials consumed performing a service',
        '',
        'Executing a booking wrote service_consumption inventory rows and nothing',
        'else. auto_create_cogs_journal fires only on transaction_type=sale, and',
        'auto_link_inventory_to_journal maps only sale/purchase - anything else',
        'falls into its ELSE branch and gets NULL. So the stock left the warehouse',
        'with no journal and no FIFO consumption: the invoice booked the revenue',
        'while the material cost never reached the P&L, the inventory account',
        'stayed inflated against stock that was gone, and the FIFO batches were',
        'never depleted, so later sales would have drawn cost from batches already',
        'used up. Never seen in production only because no booking had been',
        'executed yet.',
        '',
        'Idempotence is keyed on the inventory rows (journal_entry_id IS NULL), not',
        'on the invoice: resync_booking_invoice can append consumption rows to an',
        'already-costed invoice, and an invoice-level guard would silently leave',
        'those uncosted - the same class of silent gap being fixed here.',
        '',
        'One journal per batch of unposted rows. Not per line, because',
        'ic_duplicate_journals flags any reference_type + reference_id appearing',
        'twice. Not per invoice, because a resync top-up would then collide with',
        'the first journal and create_journal_entry_atomic rejects it as',
        'DUPLICATE_JE. The batch is keyed on its earliest unposted row.',
        '',
        'FIFO is consumed here and only here. fn_post_booking_custody_out',
        'deliberately values the batches without consuming them, because material',
        'in a technician''s hands is still owned - it is used up at execution, not',
        'at hand-over. Consuming in both places would double-count.',
        '',
        'Verified on scratch data (rolled back): lots 4@3.00 and 10@7.00, consuming',
        '6 costs 26.00; re-running posts nothing; a resync top-up of a second',
        'material costs 11.91, correctly drawing the older 1@1.911875 batch before',
        '2@5.00. No unposted rows left, zero duplicate-journal alerts.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.705 pushed - service consumption is costed" -ForegroundColor Green
}
