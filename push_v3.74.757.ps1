$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.756.ps1") { Remove-Item -LiteralPath "push_v3.74.756.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.757"') {
    Write-Host "+ 3.74.757" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.757]")) { Write-Host "X CHANGELOG missing [3.74.757]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$targets = @(
  "lib/period-closing.ts",
  "lib/pre-receipt-refund.ts",
  "lib/pre-shipment-refund.ts",
  "lib/sales-return-cash-disbursement.ts",
  "lib/manufacturing/manufacturing-accounting.ts"
)

foreach ($t in $targets) {
    if (-not (Test-Path $t)) { Write-Host "X missing: $t" -ForegroundColor Red; exit 1 }
    $src = Get-Content -LiteralPath $t -Raw

    if ($src -notmatch "rollbackJournalEntry") {
        Write-Host "X $t no longer uses the shared rollback helper" -ForegroundColor Red; exit 1
    }
    # Import present, or the call cannot compile.
    if ($src -notmatch "import \{ rollbackJournalEntry \}") {
        Write-Host "X $t calls the helper without importing it" -ForegroundColor Red; exit 1
    }
    # No inline unchecked journal-entry delete may return.
    if ($src -match 'from\("journal_entries"\)\.delete\(\)' -or $src -match "from\('journal_entries'\)\.delete\(\)") {
        Write-Host "X $t still deletes a journal entry inline, unchecked" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all five use the helper, none delete inline" -ForegroundColor Green

# The status update that would otherwise leave cash paid against an unposted
# entry. This one is not a delete and would not be caught by the rule above.
$sr = Get-Content -LiteralPath "lib/sales-return-cash-disbursement.ts" -Raw
if ($sr -notmatch "const \{ error: postErr \}") {
    Write-Host "X the posting update is unchecked again - cash could leave against a draft entry" -ForegroundColor Red; exit 1
}
if ($sr -notmatch "could not be posted") {
    Write-Host "X a failed posting no longer surfaces to the caller" -ForegroundColor Red; exit 1
}
Write-Host "+ the posting update is checked" -ForegroundColor Green

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
    "lib/period-closing.ts" `
    "lib/pre-receipt-refund.ts" `
    "lib/pre-shipment-refund.ts" `
    "lib/sales-return-cash-disbursement.ts" `
    "lib/manufacturing/manufacturing-accounting.ts" `
    "scripts/check-unchecked-writes.js" `
    "push_v3.74.757.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.756.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_757.txt"
    $msgLines = @(
        'fix(accounting): v3.74.757 - comments that promised what the code did not check',
        '',
        'Finished the rollback class: five files, eleven sites. Different shape from',
        'the six command services - here the header is created, the LINES insert',
        'fails, and only the header is deleted.',
        '',
        'The comments are the striking part. The authors knew exactly what was at',
        'stake:',
        '',
        '  manufacturing-accounting:        "Best effort: try to remove the orphan header"',
        '  sales-return-cash-disbursement:  "Roll back the JE shell so it doesn''t sit',
        '                                    there as orphan draft"',
        '  pre-shipment-refund:             "No half-state is left behind"',
        '',
        'Three comments promising an outcome, three writes that never checked it',
        'happened. "Best effort" means nobody finds out when the effort fails. "No',
        'half-state is left behind" was an intention, not a fact.',
        '',
        'One site is worse than the deletes: sales-return-cash-disbursement updates',
        'the entry to posted, unchecked. A silent failure there means the cash has',
        'physically left, the lines exist, and the ledger does not count them,',
        'because the entry stayed a draft. It now fails with "journal entry was',
        'created but could not be posted".',
        '',
        '213 to 201 to 189. Every journal-entry rollback in lib/ now reports its own',
        'failure.',
        '',
        'Named and left for individual reading rather than swept: the five sites in',
        'fixed-assets/depreciation, shareholders/contributions/reverse,',
        'hr/payroll/payments, and the fix-* maintenance routes. Their shapes differ',
        'and generalising to code I have not read is what produced most of my',
        'mistakes across these two days.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.757 pushed - every ledger rollback in lib/ now speaks up" -ForegroundColor Green
}
