$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.709.ps1") { Remove-Item -LiteralPath "push_v3.74.709.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.710"') {
    Write-Host "+ 3.74.710" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.710]")) { Write-Host "X CHANGELOG missing [3.74.710]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

Write-Host "Dumping DB functions..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump-db-functions failed" -ForegroundColor Red; exit 1 }

$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw

# Custody must no longer accept a work-in-process account (reverse collision).
if ($fn -match "inventory_in_custody','work_in_process") {
    Write-Host "X custody resolver still accepts work_in_process" -ForegroundColor Red; exit 1
}
Write-Host "+ custody resolver no longer collides with WIP" -ForegroundColor Green

if ($fn -notmatch "ic_template_accounts_missing") {
    Write-Host "X the template-vs-company checker is missing" -ForegroundColor Red; exit 1
}
Write-Host "+ template-vs-company checker present" -ForegroundColor Green

$mfg = Get-Content -LiteralPath "lib/manufacturing/manufacturing-accounting.ts" -Raw

# The three dangerous numeric fallbacks must be gone.
if ($mfg -match 'byCode\("1145"\)') {
    Write-Host "X manufacturing WIP still falls back to 1145 (technician custody)" -ForegroundColor Red; exit 1
}
if ($mfg -match 'byCode\("2210"\)') {
    Write-Host "X wages payable still falls back to 2210 (long-term loans)" -ForegroundColor Red; exit 1
}
if ($mfg -notmatch 'byCode\("1146"\)') {
    Write-Host "X manufacturing WIP does not resolve the dedicated 1146 account" -ForegroundColor Red; exit 1
}
if ($mfg -notmatch 'bySubType\("accrued_salaries"\)') {
    Write-Host "X wages payable does not match the sub_type the chart ships" -ForegroundColor Red; exit 1
}
Write-Host "+ manufacturing resolves WIP and wages without colliding" -ForegroundColor Green

# Both creators of partner capital accounts must attach a parent.
foreach ($f in @("app/shareholders/page.tsx", "app/journal-entries/new/page.tsx")) {
    $src = Get-Content -LiteralPath $f -Raw
    if ($src -notmatch "capitalParent") {
        Write-Host "X $f still creates partner capital accounts with no parent" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ partner capital accounts are filed under raas al-maal" -ForegroundColor Green

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
    "lib/manufacturing/manufacturing-accounting.ts" `
    "app/shareholders/page.tsx" `
    "app/journal-entries/new/page.tsx" `
    "supabase/migrations/20260719000710_v3_74_710_custody_wip_collision_and_template.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.710.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.709.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_710.txt"
    $msgLines = @(
        'fix(accounting): v3.74.710 - account 1145 served two purposes; manufacturing broken in 3 of 4 companies',
        '',
        'The owner asked for a full review before any further change, so that a fix',
        'in one place would not disable something elsewhere. It found three',
        'collisions of the same shape: account resolution is sub_type-first with a',
        'hardcoded numeric code as last resort, and those fallback codes had',
        'drifted out of step with the chart the template actually ships.',
        '',
        '1) 1145 - custody vs work in process. A May migration claimed 1145 for',
        'manufacturing WIP. In v3.74.685 I added the technician custody account to',
        'the template at the same code - I reviewed the chart of accounts then, but',
        'not the manufacturing module''s fallback chain. In one company a single',
        'account named "materials in technician custody" carried',
        'sub_type=work_in_process with wip_account_id pointing at it, so custody',
        'balances and production costs would have commingled. In the other three,',
        'WIP resolution fell through to byCode("1145") and would have posted',
        'production into custody. It ran both ways: my custody resolver accepted',
        'work_in_process as an alternative. Safe to separate - 1145 carries only',
        'booking_custody journals, net zero, and no production journals exist.',
        '',
        '2) 5410 was never in the template. The same migration created it for the',
        'companies existing then; new companies are seeded from the template, so',
        'all three created afterwards lacked it and manufacturing threw',
        'MANUFACTURING_ACCOUNTS_NOT_CONFIGURED. Any new client would have hit this',
        'on day one.',
        '',
        '3) No template account carries sub_type=wages_payable (accrued salaries',
        'ship as 2130/accrued_salaries), so wages always fell through to',
        'byCode("2210") - long-term loans in the default chart.',
        '',
        'Custody keeps 1145; WIP gets its own 1146. The dangerous numeric fallbacks',
        'are removed rather than re-pointed - a wrong-account posting is worse than',
        'a clear configuration error - and the manufacturing links are set',
        'explicitly so resolution never needs the last resort.',
        '',
        'Orphans: partner capital filed under 3100 (it is the breakdown of capital)',
        'with orderly codes, overhead under 5000. Both creators fixed - each used',
        '"max equity code + 1" with no parent, which is why one company got',
        '3301/3302 and another 3601 for the same concept. No effect on reported',
        'figures: the balance sheet aggregates by account_type, not by tree.',
        '',
        'New checker compares every company against the template, on presence AND',
        'sub_type. The sub_type half matters as much: resolution is sub_type-first,',
        'so a wrong one sends postings to the wrong account silently. It would have',
        'caught all three collisions on day one.',
        '',
        'Verified across all four companies, all 51 integrity checks clean.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.710 pushed - custody and WIP separated, template complete" -ForegroundColor Green
}
