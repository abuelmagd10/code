$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.701.ps1") { Remove-Item -LiteralPath "push_v3.74.701.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.702"') {
    Write-Host "+ 3.74.702" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.702]")) { Write-Host "X CHANGELOG missing [3.74.702]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

Write-Host "Dumping DB functions..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump-db-functions failed" -ForegroundColor Red; exit 1 }

$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw

# COGS must read the FIFO batches, not the product card.
if ($fn -notmatch "consume_fifo_lots") {
    Write-Host "X auto_create_cogs_journal is not using consume_fifo_lots" -ForegroundColor Red; exit 1
}
Write-Host "+ COGS reads the FIFO batches" -ForegroundColor Green

# Both return directions must be live in the dumped schema.
foreach ($f in @("restore_fifo_lots_on_return",
                 "reduce_fifo_lots_on_purchase_return",
                 "fn_fifo_on_purchase_return")) {
    if ($fn -notmatch [regex]::Escape($f)) {
        Write-Host "X missing function in DB dump: $f" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ sale-return and purchase-return FIFO paths present" -ForegroundColor Green

# The four dashboard checkers must all carry the marker (soft-deleted journals).
$marker = ([regex]::Matches($fn, "v3\.74\.702")).Count
if ($marker -lt 5) {
    Write-Host "X expected the v3.74.702 marker in the 4 ic_* checkers + COGS, found $marker" -ForegroundColor Red; exit 1
}
Write-Host "+ integrity checkers carry the v3.74.702 marker ($marker hits)" -ForegroundColor Green

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
    "supabase/migrations/20260719000702_v3_74_702_fifo_cogs_and_drift_checkers.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.702.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.701.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_702.txt"
    $msgLines = @(
        'fix(inventory): v3.74.702 - FIFO is the cost basis, and the 4 drift alerts',
        '',
        'Three of the four dashboard alerts were false: every ic_* checker joined',
        'journal_entries on status=posted without excluding is_deleted, so a voided',
        'document was counted alongside its replacement. That would have fired for',
        'any voided document.',
        '',
        'The fourth was real. COGS was qty * products.cost_price, but that column is',
        'only a default that pre-fills a purchase invoice - when the price is typed',
        'on the invoice instead, the card stays 0 and the sale was booked at zero',
        'cost. auto_create_cogs_journal now consumes the FIFO lots, which carry the',
        'price actually paid per batch, and falls back to the card only for legacy',
        'stock with no lots.',
        '',
        'Returns are aligned in both directions, partial and full:',
        '- restore_fifo_lots_on_return puts sold units back into the exact batches',
        '  they left, newest batch first, and returns that cost so COGS is reversed',
        '  at the original figure. reverse_fifo_consumption could not be reused - it',
        '  deletes every consumption row for a reference, so it only served a 100%',
        '  return.',
        '- reduce_fifo_lots_on_purchase_return takes units back out of the batches',
        '  when goods go to the supplier, preferring the returned bill''s own batch.',
        '  Nothing did this before; two such returns already exist.',
        '- The sale-return guard skipped the reversal whenever any cogs_return',
        '  journal existed for the invoice, so a second partial return posted no',
        '  reversal at all. Each return movement now carries its own journal.',
        '',
        'Verified on scratch data (rolled back): 10@5 + 10@8, sell 12 = 66.00,',
        'partial return 3 = 21.00, full return 9 = 45.00, purchase return 4 = 32.00',
        'then 6 = 48.00, and zero lot-integrity violations. All four alerts clear.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.702 pushed - FIFO cost basis + returns + drift alerts cleared" -ForegroundColor Green
}
