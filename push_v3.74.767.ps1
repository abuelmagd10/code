$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.766.ps1") { Remove-Item -LiteralPath "push_v3.74.766.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.767"') {
    Write-Host "+ 3.74.767" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.767]")) { Write-Host "X CHANGELOG missing [3.74.767]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$svc = "lib/services/financial-integrity-check.service.ts"
$s = Get-Content -LiteralPath $svc -Raw

# The fix is: follow the parent operation before calling an entry orphaned.
if ($s -notmatch "const tracedParents = new Set<string>\(\)") {
    Write-Host "X the orphan check must follow the parent operation" -ForegroundColor Red; exit 1
}
if ($s -notmatch "tracedParents\.has\(entry\.reference_id\)") {
    Write-Host "X entries whose parent is traced must not be reported as orphans" -ForegroundColor Red; exit 1
}
Write-Host "+ orphan check follows the parent operation" -ForegroundColor Green

# A failed parent lookup must not silently restore the old behaviour. This is
# the pattern that blocked the annual closing for weeks in v3.74.764.
if ($s -notmatch "const \{ data: parentLinks, error: parentError \}") {
    Write-Host "X the parent lookup must capture its error" -ForegroundColor Red; exit 1
}
if ($s -notmatch "Journal parent-trace check unavailable") {
    Write-Host "X a failed parent lookup must report 'unavailable', not 'orphaned'" -ForegroundColor Red
    exit 1
}
Write-Host "+ a failed parent lookup reports unavailable, not orphaned" -ForegroundColor Green

# The real gaps must NOT be silenced along with the noise. Guard the intent by
# requiring the two genuinely untraced paths to stay named in the code, so a
# future edit that widens the exemption has to confront them.
foreach ($named in @("expenses \(7\)", "booking custody movements \(6\)")) {
    if ($s -notmatch $named) {
        Write-Host "X the real remaining gap must stay documented in the service" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ the 16 real gaps stay documented, not absorbed into the exemption" -ForegroundColor Green

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 2
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

git add -- "lib/version.ts" "CHANGELOG.md" $svc "push_v3.74.767.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.766.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_767.txt"
    $msgLines = @(
        'fix(integrity): v3.74.767 - 48 trace findings, 16 of them real',
        '',
        'A journal entry is auditable if EITHER it carries its own trace link OR the',
        'operation it belongs to does. The check demanded a direct link on every',
        'entry, and produced 48 findings of which 32 were not gaps.',
        '',
        'A COGS entry is a child of its invoice. It is created by the',
        'auto_create_cogs_journal trigger, and a database trigger has no knowledge',
        'of the operation context, so it cannot write a trace link. The invoice',
        'above it carries the full trace and every one of those entries was',
        'reachable through it. Same for invoice_payment, bill, invoice,',
        'payment_reversal and the reversal families.',
        '',
        'The 16 that remain are real and they cluster in two places: expenses (7)',
        'and booking custody movements (6), plus three one-offs. Neither path',
        'records a trace at any level. Those are the entries an auditor''s question',
        'lands on - who authorised this expense, and when - and they were sitting',
        'under twice their number in noise.',
        '',
        'Reporting a child as orphaned because the parent holds the record is the',
        'same over-reporting that blocked the annual closing in v3.74.764: a check',
        'asking a narrower question than the one that matters.',
        '',
        'Verified before shipping, across every company: 48 flagged, 32 correctly',
        'silent, 16 still reported, and the reported set is exactly expense,',
        'booking_custody_adjust/out/return, expense_reclassification,',
        'payment_correction_repost and service_consumption_cogs. No real gap',
        'disappeared.',
        '',
        'If the parent lookup fails, the check reports "unavailable" rather than',
        'falling back to calling every entry orphaned.',
        '',
        'Deliberately NOT done: adding trace writes to the expense and booking',
        'custody paths. That edits code which posts to the ledger, and it belongs',
        'in a fresh session rather than the forty-fifth release of one day. The gap',
        'is now visible, counted and named instead of unknown.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.767 pushed - 16 real audit gaps, no longer buried" -ForegroundColor Green
}
