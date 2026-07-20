$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.755.ps1") { Remove-Item -LiteralPath "push_v3.74.755.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.756"') {
    Write-Host "+ 3.74.756" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.756]")) { Write-Host "X CHANGELOG missing [3.74.756]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$helper = "lib/services/rollback-journal-entry.ts"
if (-not (Test-Path $helper)) { Write-Host "X helper missing" -ForegroundColor Red; exit 1 }
$h = Get-Content -LiteralPath $helper -Raw

# Both deletes must be checked - that is the entire point.
if ($h -notmatch "linesErr" -or $h -notmatch "headerErr") {
    Write-Host "X the helper no longer checks both deletes" -ForegroundColor Red; exit 1
}
# Lines before header: the reverse leaves orphan lines if the second fails.
$linesPos  = $h.IndexOf('"journal_entry_lines"')
$headerPos = $h.IndexOf('.from("journal_entries")')
if ($linesPos -lt 0 -or $headerPos -lt 0 -or $linesPos -gt $headerPos) {
    Write-Host "X the helper deletes the header before the lines - orphan lines on partial failure" -ForegroundColor Red; exit 1
}
Write-Host "+ helper checks both deletes, lines first" -ForegroundColor Green

# It must NOT throw: throwing replaces the original error with a cleanup error.
if ($h -match "throw\s+new\s+Error" -or $h -match "^\s*throw\s" ) {
    Write-Host "X the helper throws - that would mask the original failure the caller needs" -ForegroundColor Red; exit 1
}
if ($h -notmatch "ROLLBACK_INCOMPLETE") {
    Write-Host "X the greppable marker is gone - a stranded ledger entry becomes unfindable" -ForegroundColor Red; exit 1
}
Write-Host "+ logs a searchable marker instead of throwing" -ForegroundColor Green

# All six command services must use it, and none may still hand-roll the pair.
$services = @("manual-journal","customer-refund","customer-voucher",
              "shareholder-capital","bank-transfer","supplier-refund-receipt")
foreach ($s in $services) {
    $p = "lib/services/$s-command.service.ts"
    if (-not (Test-Path $p)) { Write-Host "X missing service: $p" -ForegroundColor Red; exit 1 }
    $src = Get-Content -LiteralPath $p -Raw
    if ($src -notmatch "rollbackJournalEntry") {
        Write-Host "X $s does not use the shared rollback helper" -ForegroundColor Red; exit 1
    }
    if ($src -match 'from\("journal_entries"\)\.delete\(\)\.eq\("id", journalEntryId\)') {
        Write-Host "X $s still deletes the journal entry inline, unchecked" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all six services rolled back through the helper" -ForegroundColor Green

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
$scan = & node scripts/check-unchecked-writes.js 2>&1 | Out-String
$scanCode = $LASTEXITCODE
Write-Host ($scan.Trim())
if ($scanCode -ne 0) {
    Write-Host "X baseline mismatch - set BASELINE to the 'Found' number above" -ForegroundColor Red; exit 1
}
Write-Host "+ baseline holds" -ForegroundColor Green

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

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "$helper" `
    "lib/services/manual-journal-command.service.ts" `
    "lib/services/customer-refund-command.service.ts" `
    "lib/services/customer-voucher-command.service.ts" `
    "lib/services/shareholder-capital-command.service.ts" `
    "lib/services/bank-transfer-command.service.ts" `
    "lib/services/supplier-refund-receipt-command.service.ts" `
    "scripts/check-unchecked-writes.js" `
    "push_v3.74.756.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.755.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_756.txt"
    $msgLines = @(
        'fix(accounting): v3.74.756 - rollbacks that quietly did not roll back',
        '',
        'Six command services undid a partially written journal entry inside a',
        'catch block, then rethrew the original error. The two deletes discarded',
        'their result, and supabase-js does not throw on a failed delete - so if',
        'the compensation failed, nothing happened and nothing was said. The',
        'caller saw the first error and had no way to know the cleanup had failed',
        'too.',
        '',
        'What survives that is a journal entry from an operation that was supposed',
        'to have been undone. It balances against nothing, no document references',
        'it, and nobody is told.',
        '',
        'rollbackJournalEntry now performs both deletes and checks both. Lines',
        'first, header second - the reverse order would leave lines pointing at a',
        'header that no longer exists if the second delete failed.',
        '',
        'It deliberately does not throw. Throwing here would replace the ORIGINAL',
        'error - the reason the operation failed in the first place - with a',
        'cleanup error, and the caller would lose the diagnosis that matters. It',
        'logs ROLLBACK_INCOMPLETE instead, which is a fixed string to search for',
        'when a ledger entry turns up that no document explains.',
        '',
        'Applied to manual-journal, customer-refund, customer-voucher,',
        'shareholder-capital, bank-transfer and supplier-refund-receipt. All six',
        'had byte-identical blocks, which is why the change is mechanical rather',
        'than interpretive. 213 unchecked writes down to 201.',
        '',
        'Five more are in the same class and are named in the script rather than',
        'swept up: period-closing, pre-receipt-refund, pre-shipment-refund,',
        'sales-return-cash-disbursement and manufacturing-accounting. Their shapes',
        'differ, and generalising to code I have not read is exactly what produced',
        'sixteen mistakes over these two days. The remainder are audit-log inserts,',
        'where a failure costs a log line rather than a ledger.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.756 pushed - rollbacks now report when they fail" -ForegroundColor Green
}
