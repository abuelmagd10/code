$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.749.ps1") { Remove-Item -LiteralPath "push_v3.74.749.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.750"') {
    Write-Host "+ 3.74.750" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.750]")) { Write-Host "X CHANGELOG missing [3.74.750]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$mig = "supabase/migrations/20260720000008_v3_74_750_self_scope_and_invoice_scope.sql"
if (-not (Test-Path $mig)) { Write-Host "X migration file missing" -ForegroundColor Red; exit 1 }
$m = Get-Content -LiteralPath $mig -Raw

# The self guard answers a different question from the company guard. Replacing
# it with assert_company_access would pass every caller - they ARE members of
# the company, they are just acting as someone else inside it.
if ($m -notmatch "p_user_id <> v_uid") {
    Write-Host "X assert_is_self no longer compares the caller to the session user" -ForegroundColor Red; exit 1
}
if ($m -notmatch "ERRCODE = '57014'") {
    Write-Host "X the self guard uses a catchable errcode" -ForegroundColor Red; exit 1
}
foreach ($fn in @('update_username','mark_notification_as_read','batch_mark_notifications_as_read')) {
    if ($m -notmatch "\('$fn',\s*'self',\s*'p_user_id'\)") {
        Write-Host "X $fn is no longer self-scoped - a company check here protects nothing" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ user-scoped functions check identity, not company" -ForegroundColor Green

# The watcher must recognise BOTH guards or it under-reports progress, the exact
# failure corrected in v3.74.729.
if ($m -notmatch "NOT ILIKE '%assert_is_self%'") {
    Write-Host "X the watcher does not recognise assert_is_self - it would keep counting guarded functions" -ForegroundColor Red; exit 1
}
if ($m -notmatch "NOT ILIKE '%assert_company_access%'") {
    Write-Host "X the watcher stopped recognising assert_company_access" -ForegroundColor Red; exit 1
}
Write-Host "+ watcher recognises both guards" -ForegroundColor Green

# The five left alone must stay named, with the polymorphic pair called out -
# guessing a table for a polymorphic reference guards the wrong row.
foreach ($fn in @('restore_fifo_lots_on_return','reverse_fifo_consumption','link_financial_operation_trace')) {
    if ($m -notmatch [regex]::Escape($fn)) {
        Write-Host "X $fn dropped from the documented exclusions" -ForegroundColor Red; exit 1
    }
}
if ($m -notmatch "polymorphic") {
    Write-Host "X the reason the FIFO pair cannot be resolved is no longer recorded" -ForegroundColor Red; exit 1
}
Write-Host "+ remaining five documented with reasons" -ForegroundColor Green

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

git add -- "lib/version.ts" "CHANGELOG.md" "$mig" "push_v3.74.750.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.749.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_750.txt"
    $msgLines = @(
        'security: v3.74.750 - "which company" was the wrong question for five of them',
        '',
        'Reading the last 13 individually turned up a defect that company-scoping',
        'could never have caught. Five of them are not company-scoped at all:',
        'update_username, mark_notification_as_read, update_notification_status and',
        'the two batch variants. Each takes the user id FROM THE CALLER and never',
        'compares it to the session. update_username will rename any user_profiles',
        'row you name; the notification functions let one user mark another''s',
        'notifications read or archived.',
        '',
        'Holding them back from the company sweep was right, and for a sharper',
        'reason than "unresolved". assert_company_access would have passed every',
        'one of these calls - the caller genuinely IS a member of the company. They',
        'are simply acting as a different person inside it. A company check here',
        'would have looked like protection while providing none, which is worse',
        'than no check at all.',
        '',
        'So assert_is_self asks the question that actually applies: is this you?',
        'Verified by execution - server-side call allowed, acting as yourself',
        'allowed, acting as another user rejected.',
        '',
        'Three more are invoice-scoped and guarded the usual way.',
        '',
        'Five remain, named with their reasons rather than quietly dropped. Two of',
        'them - restore_fifo_lots_on_return and reverse_fifo_consumption - take a',
        'polymorphic reference (p_reference_type plus p_reference_id) and cannot be',
        'resolved to a single table by construction. Guessing a table for a',
        'polymorphic reference is how you end up guarding the wrong row.',
        '',
        'And the watcher reported 10 rather than 5 afterwards, because it did not',
        'know about assert_is_self - the identical failure fixed in v3.74.729 when',
        'assert_company_access was introduced. A counter that ignores a new guard',
        'makes real progress read as none. Now taught both.',
        '',
        'Counter 48 to 5. Ledger-touching writers complete at 19 of 19.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.750 pushed - 48 down to 5" -ForegroundColor Green
}
