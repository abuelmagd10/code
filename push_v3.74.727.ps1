$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.726.ps1") { Remove-Item -LiteralPath "push_v3.74.726.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.727"') {
    Write-Host "+ 3.74.727" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.727]")) { Write-Host "X CHANGELOG missing [3.74.727]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$m1 = "supabase/migrations/20260719000727_v3_74_727_revoke_anon_from_unguarded_writers.sql"
$m2 = "supabase/migrations/20260719000728_v3_74_727_ic_exposed_definer_functions.sql"
foreach ($m in @($m1, $m2)) {
    if (-not (Test-Path $m)) { Write-Host "X missing migration: $m" -ForegroundColor Red; exit 1 }
}

# The revoke must keep authenticated working. A REVOKE with no matching GRANT
# would take the whole application down rather than secure it.
$r1 = Get-Content -LiteralPath $m1 -Raw
if ($r1 -notmatch "REVOKE ALL ON FUNCTION" -or $r1 -notmatch "FROM PUBLIC, anon") {
    Write-Host "X phase 1 no longer revokes PUBLIC/anon" -ForegroundColor Red; exit 1
}
if ($r1 -notmatch "GRANT EXECUTE ON FUNCTION.*TO authenticated, service_role") {
    Write-Host "X phase 1 revokes without re-granting - this would break every logged-in user" -ForegroundColor Red; exit 1
}
Write-Host "+ phase 1 revokes anon and re-grants authenticated" -ForegroundColor Green

# The watcher is the only thing standing between us and this class regrowing.
$r2 = Get-Content -LiteralPath $m2 -Raw
if ($r2 -notmatch "ic_exposed_definer_functions") {
    Write-Host "X the integrity check is gone - nothing would notice a regression" -ForegroundColor Red; exit 1
}
if ($r2 -notmatch "'security'::text") {
    Write-Host "X the security category is not permitted by the constraint - the insert will fail" -ForegroundColor Red; exit 1
}
Write-Host "+ watcher installed under a security category" -ForegroundColor Green

# Category lists are the recurring two-sources-of-truth trap here: a category
# the API does not count renders as nothing, so findings exist and stay unseen.
$api = Get-Content -LiteralPath "app/api/governance/system-integrity/route.ts" -Raw
if ($api -notmatch 'CATEGORIES = \[') {
    Write-Host "X the API stopped deriving counts from CATEGORIES" -ForegroundColor Red; exit 1
}
if ($api -notmatch '"security"') {
    Write-Host "X the API does not count the security category - findings would be invisible" -ForegroundColor Red; exit 1
}
$w = Get-Content -LiteralPath "app/dashboard/_widgets/SystemIntegrityWidget.tsx" -Raw
if ($w -notmatch "CATEGORIES\.filter") {
    Write-Host "X the widget went back to one hardcoded line per category" -ForegroundColor Red; exit 1
}
if ($w -notmatch "security:") {
    Write-Host "X the widget has no label for the security category" -ForegroundColor Red; exit 1
}
Write-Host "+ API and widget both derive categories from one list" -ForegroundColor Green

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
    "$m1" `
    "$m2" `
    "app/api/governance/system-integrity/route.ts" `
    "app/dashboard/_widgets/SystemIntegrityWidget.tsx" `
    "push_v3.74.727.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.726.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_727.txt"
    $msgLines = @(
        'security: v3.74.727 - revoke anon from 116 unguarded SECURITY DEFINER writers',
        '',
        'v3.74.726 retired one bad function. But the shape that made it dangerous',
        'was not unique to it, so I searched for the shape: SECURITY DEFINER (full',
        'rights, RLS does not apply), EXECUTE granted to PUBLIC, company_id taken',
        'from the caller, writes, and no membership check. 116 functions matched,',
        'including perform_annual_closing_atomic, distribute_dividends_atomic and',
        'process_invoice_payment_atomic.',
        '',
        'I did not trust the pattern alone. Hand-checked three of the worst: none',
        'reference auth.*, current_setting, company_members, or any permission',
        'helper. The exposure is real, not an artifact of a crude query.',
        '',
        'And it was worse than expected: anon, not just authenticated. The anon key',
        'ships in the browser bundle, so closing a fiscal year or distributing',
        'dividends on an arbitrary company_id required no account at all.',
        '',
        'Phase 1, here: revoke PUBLIC and anon, grant authenticated and',
        'service_role. anon drops from 116 to 0 and the application behaves exactly',
        'as before - nothing in the UI calls these as a visitor. Scope is computed',
        'from the audit query rather than hand-listed, so no function leaks through',
        'a stale copied list.',
        '',
        'Phase 2 is NOT done and is not claimed to be: a logged-in user of company A',
        'can still pass company B''s id. That needs a membership check inside each',
        'function, in reviewed batches.',
        '',
        'Added ic_exposed_definer_functions under a new "security" category, because',
        'the real reason fix_historical_cogs survived so long is that nothing was',
        'watching. It reports any return of anon reachability, and counts the Phase 2',
        'remainder so the number visibly falls.',
        '',
        'Adding the category exposed the usual two-sources-of-truth trap: both the',
        'widget and the governance API listed categories by hand, one line each, so',
        'a new category would have been counted in the total and rendered as',
        'nothing - findings present in the data and invisible on screen. Both now',
        'iterate one CATEGORIES list.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.727 pushed - anon revoked, watcher installed" -ForegroundColor Green
}
