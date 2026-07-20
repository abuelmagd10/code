$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.748.ps1") { Remove-Item -LiteralPath "push_v3.74.748.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.749"') {
    Write-Host "+ 3.74.749" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.749]")) { Write-Host "X CHANGELOG missing [3.74.749]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$mig = "supabase/migrations/20260720000007_v3_74_749_guard_remaining_row_id_writers.sql"
if (-not (Test-Path $mig)) { Write-Host "X migration file missing" -ForegroundColor Red; exit 1 }
$m = Get-Content -LiteralPath $mig -Raw

# Overloads. close_accounting_period has two signatures; selecting by name with
# LIMIT 1 would guard one and leave the other open without saying so.
if ($m -notmatch "FOR f IN\s*\r?\n\s*SELECT p\.oid") {
    Write-Host "X the patcher no longer iterates overloads - a second signature would go unguarded" -ForegroundColor Red; exit 1
}
if ($m -match "LIMIT 1;\s*\r?\n\s*IF v_def IS NULL") {
    Write-Host "X the patcher is back to picking one function per name" -ForegroundColor Red; exit 1
}
Write-Host "+ patcher covers every overload" -ForegroundColor Green

# The parameter-existence check is what stopped a wrong mapping from shipping.
if ($m -notmatch "has no parameter") {
    Write-Host "X the parameter check is gone - a wrong mapping would inject code that cannot compile" -ForegroundColor Red; exit 1
}
if ($m -notmatch "'resubmit_purchase_return',\s*'purchase_returns',\s*'p_return_id'") {
    Write-Host "X resubmit_purchase_return mapping reverted to the wrong parameter name" -ForegroundColor Red; exit 1
}
Write-Host "+ parameter names verified against the real signatures" -ForegroundColor Green

# The 13 left alone must stay named in the file, not silently dropped. Several
# are user-scoped, not company-scoped - guarding them by company would be the
# wrong check rather than a missing one.
foreach ($fn in @('update_username', 'mark_notification_as_read', 'restore_fifo_lots_on_return')) {
    if ($m -notmatch [regex]::Escape($fn)) {
        Write-Host "X $fn is no longer listed among the deliberate exclusions" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ deliberate exclusions still documented" -ForegroundColor Green

$pairs = [regex]::Matches($m, "\('([a-z_0-9]+)',\s*'([a-z_0-9]+)',\s*'(p_[a-z_]+)'\)")
if ($pairs.Count -ne 16) {
    Write-Host "X expected 16 mappings, found $($pairs.Count)" -ForegroundColor Red; exit 1
}
Write-Host "+ 16 mappings intact" -ForegroundColor Green

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }
if ($testsLine -match "(\d+)\s+passed" -and [int]$Matches[1] -gt 60) {
    Write-Host "X $($Matches[1]) passed, expected ~50" -ForegroundColor Red; exit 1
}
Write-Host "+ critical tests as expected" -ForegroundColor Green

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

git add -- "lib/version.ts" "CHANGELOG.md" "$mig" "push_v3.74.749.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.748.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_749.txt"
    $msgLines = @(
        'security: v3.74.749 - 17 function bodies guarded, two errors caught by checks',
        '',
        '16 remaining row-id writers, 17 bodies once overloads are counted:',
        'approvals, discount evaluation, custody movements, period closing,',
        'permission transfers. None touch the ledger, but the defect is the same -',
        'a logged-in user of one company could act on another company''s row.',
        '',
        'Two things I got wrong on the first attempt, both stopped by checks rather',
        'than by me:',
        '',
        'I wrote p_purchase_return_id for resubmit_purchase_return; the parameter is',
        'p_return_id. I had inferred parameter names from an earlier query and',
        'copied them into the mapping by hand. The parameter-existence check',
        'aborted the whole migration rather than injecting a call that could not',
        'compile - the only reason it did not ship broken.',
        '',
        'And close_accounting_period has two overloads. Selecting by name with',
        'LIMIT 1 would have guarded one signature and left the other open, silently.',
        'The loop now iterates pg_proc rows, so every overload of every listed name',
        'is covered; both signatures verified guarded afterwards.',
        '',
        'Thirteen are deliberately left alone and named in the migration rather than',
        'dropped from the story. Several are not company-scoped at all -',
        'update_username belongs to a user, mark_notification_as_read to a',
        'recipient. Guarding those by company would be the WRONG check, not a',
        'missing one, and a wrong check is worse because it looks like protection.',
        'They need reading individually.',
        '',
        'Verified by execution on a real branch: server-side call allowed, member',
        'allowed, user from another company rejected.',
        '',
        'Counter 48 to 13, with ledger-touching writers complete at 19 of 19.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.749 pushed - 48 down to 13" -ForegroundColor Green
}
