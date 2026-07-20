$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.757.ps1") { Remove-Item -LiteralPath "push_v3.74.757.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.758"') {
    Write-Host "+ 3.74.758" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.758]")) { Write-Host "X CHANGELOG missing [3.74.758]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# I edited dead code inside a block comment in the invoice edit page, then
# reverted it. The revert also rewrote every line ending in that file, so the
# working copy differs from HEAD by 1550 lines of nothing. Restore it outright
# rather than committing that noise.
$deadFile = "app/invoices/[id]/edit/page.tsx"
git checkout -- $deadFile 2>&1 | Out-Null
$stillDirty = git diff --name-only -- $deadFile
if ($stillDirty) {
    Write-Host "X $deadFile is still modified - it must not be part of this release" -ForegroundColor Red
    exit 1
}
Write-Host "+ invoice edit page restored untouched" -ForegroundColor Green

$dep = Get-Content -LiteralPath "app/api/fixed-assets/[id]/depreciation/route.ts" -Raw
if ($dep -notmatch "import \{ rollbackJournalEntry \}") {
    Write-Host "X depreciation route calls the helper without importing it" -ForegroundColor Red; exit 1
}
if ($dep -match "from\('journal_entries'\)\.delete\(\)" -or $dep -match 'from\("journal_entries"\)\.delete\(\)') {
    Write-Host "X depreciation route still deletes a journal entry inline, unchecked" -ForegroundColor Red; exit 1
}
# Five call sites. The import line is "import { rollbackJournalEntry } from ..."
# with no parenthesis, so it does not match a call pattern — an earlier version
# of this guard counted it as a sixth and rejected correct code.
$calls = ([regex]::Matches($dep, "rollbackJournalEntry\(")).Count
if ($calls -ne 5) {
    Write-Host "X expected 5 rollback call sites in the depreciation route, found $calls" -ForegroundColor Red; exit 1
}
Write-Host "+ all five depreciation rollbacks go through the helper" -ForegroundColor Green

$sh = Get-Content -LiteralPath "app/api/shareholders/contributions/[id]/reverse/route.ts" -Raw
if ($sh -notmatch "rollbackJournalEntry") {
    Write-Host "X contribution reversal does not use the helper" -ForegroundColor Red; exit 1
}
# The posting update is the one that leaves the app and the ledger disagreeing.
if ($sh -notmatch "const \{ error: revPostErr \}") {
    Write-Host "X the reversal posting is unchecked - the app would show it reversed while the ledger keeps it" -ForegroundColor Red; exit 1
}
Write-Host "+ contribution reversal: rollback and posting both checked" -ForegroundColor Green

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
$scan = & node scripts/check-unchecked-writes.js 2>&1 | Out-String
$scanCode = $LASTEXITCODE
Write-Host ($scan.Trim())
if ($scanCode -ne 0) {
    Write-Host "X baseline mismatch - set BASELINE to the 'Found' number above" -ForegroundColor Red; exit 1
}
Write-Host "+ baseline holds at 179" -ForegroundColor Green

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
    "app/api/fixed-assets/[id]/depreciation/route.ts" `
    "app/api/shareholders/contributions/[id]/reverse/route.ts" `
    "scripts/check-unchecked-writes.js" `
    "push_v3.74.758.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.757.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "invoices") {
    Write-Host "X the invoice edit page got staged - it must not be in this release" -ForegroundColor Red; exit 1
}
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_758.txt"
    $msgLines = @(
        'fix(accounting): v3.74.758 - depreciation reversals, and a fix to dead code',
        '',
        'Real work first. Cancelling posted depreciation rolls back through five',
        'paths, all previously unchecked. Two of them matter a great deal: if the',
        'second line insert fails and the cleanup fails quietly, a HALF-BALANCED',
        'reversal stays in the ledger; if the schedule update fails, the reversal',
        'entry and the original both stand and the depreciation is cancelled twice',
        'over.',
        '',
        'Capital contribution reversal had the same delete problem plus an',
        'unchecked posting update - a silent failure there leaves the application',
        'showing the contribution as reversed while the ledger still carries it in',
        'full. 189 unchecked writes down to 179.',
        '',
        'Two entries from my own list needed nothing, and both are recorded in the',
        'script so nobody reopens them.',
        '',
        'app/api/hr/payroll/payments already checks both deletes. I had carried it',
        'across from a different search''s output and never re-read it.',
        '',
        'And app/invoices/[id]/edit/page.tsx is the one worth admitting properly. I',
        'read the code, diagnosed a convincing defect - delete fails silently, the',
        'code re-posts, revenue and COGS counted twice - and wrote a fix with a',
        'confident explanation. The entire block sits inside a comment spanning',
        'lines 543 to 1024, headed "Legacy direct UI mutation path retained as a',
        'reference only ... Do not re-enable this block", with a bare return',
        'immediately above it. It does not run. Live edits go through the API.',
        '',
        'What exposed it was the counter refusing to move after the "fix". My',
        'hand-check said 5 sites; the scanner, which tracks block comments, said 0.',
        'The scanner was right. Had I trusted my number over its number I would',
        'have announced fixing a defect that does not exist. The file is reverted.',
        '',
        'Eighteenth mistake of this kind across the work, and the clearest: I read',
        'something that looked like live code and ignored both the return above it',
        'and a comment telling me not to.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.758 pushed - depreciation reversals now report failure" -ForegroundColor Green
}
