$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.705.ps1") { Remove-Item -LiteralPath "push_v3.74.705.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.706"') {
    Write-Host "+ 3.74.706" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.706]")) { Write-Host "X CHANGELOG missing [3.74.706]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

Write-Host "Dumping DB functions..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump-db-functions failed" -ForegroundColor Red; exit 1 }

$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw

# The invoice COGS engine must skip lines already costed as service materials.
if ($fn -notmatch "v3\.74\.706") {
    Write-Host "X execute_sales_invoice_accounting is still the double-costing version" -ForegroundColor Red; exit 1
}
if ($fn -notmatch "sc\.transaction_type = 'service_consumption'") {
    Write-Host "X the double-cost exclusion is missing" -ForegroundColor Red; exit 1
}
Write-Host "+ invoice COGS engine skips already-costed service materials" -ForegroundColor Green

# v3.74.705's costing must still be there - this release corrects it, not reverts it.
if ($fn -notmatch "fn_post_service_consumption_cogs") {
    Write-Host "X the service-consumption costing function has gone missing" -ForegroundColor Red; exit 1
}
Write-Host "+ FIFO-based service costing still in place" -ForegroundColor Green

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
    "supabase/migrations/20260719000706_v3_74_706_fix_double_costed_service_materials.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.706.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.705.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_706.txt"
    $msgLines = @(
        'fix(accounting): v3.74.706 - service materials were costed twice (regression from 705)',
        '',
        'In v3.74.705 I concluded nothing costed service consumption. I checked',
        'auto_create_cogs_journal and auto_link_inventory_to_journal and stopped',
        'there. I never checked execute_sales_invoice_accounting - called by',
        'complete_booking_atomic a few lines below where I inserted my own call,',
        'in the very function I was editing.',
        '',
        'A service''s materials are written to the invoice as lines, and that engine',
        'costs every non-service product line at products.cost_price. So executing',
        'a booking produced two cost journals for the same items: 19.90 from the',
        'FIFO batches (correct) and 21.00 from the card price. 40.90 of cost for',
        'materials worth 19.90, and three drift alerts.',
        '',
        'What 705 still had right: the old engine valued at the gross card price,',
        'not the landed cost, and never consumed the FIFO batches, so phantom batch',
        'quantity really was accumulating. The FIFO consumption belongs where 705',
        'put it. What was wrong was leaving the second, cruder valuation beside it.',
        '',
        'execute_sales_invoice_accounting now skips any line already consumed as',
        'service material for that invoice. Ordinary sales invoices are untouched -',
        'they carry no service_consumption rows so the NOT EXISTS never matches.',
        '',
        'The double journal is reversed rather than edited: posted entries are',
        'immutable by design and a reversal is the correct treatment. The repair is',
        'scoped to invoices where every costed line is a consumed service material,',
        'so a mixed invoice is never touched blindly, and is idempotent.',
        '',
        'Verified: all three alerts cleared, custody account back to 0.00.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.706 pushed - one cost per line" -ForegroundColor Green
}
