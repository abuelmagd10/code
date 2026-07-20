$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.747.ps1") { Remove-Item -LiteralPath "push_v3.74.747.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.748"') {
    Write-Host "+ 3.74.748" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.748]")) { Write-Host "X CHANGELOG missing [3.74.748]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$mig = "supabase/migrations/20260720000006_v3_74_748_guard_last_four_ledger_functions.sql"
if (-not (Test-Path $mig)) { Write-Host "X migration file missing" -ForegroundColor Red; exit 1 }
$m = Get-Content -LiteralPath $mig -Raw

# The refusal is the substantive fix. force_delete_all_depreciation_schedules
# counted posted entries into v_posted_count and then deleted them anyway.
if ($m -notmatch "assert_no_posted_depreciation") {
    Write-Host "X the posted-depreciation refusal is gone - deleting an asset would erase posted entries" -ForegroundColor Red; exit 1
}
if ($m -notmatch "je\.status = 'posted'") {
    Write-Host "X the refusal no longer looks at posted entries specifically" -ForegroundColor Red; exit 1
}
if ($m -notmatch "ERRCODE = '57014'") {
    Write-Host "X the refusal uses a catchable errcode - a WHEN OTHERS handler would swallow it" -ForegroundColor Red; exit 1
}
Write-Host "+ posted depreciation refused, uncatchably" -ForegroundColor Green

# Both deleters must carry it, not just the one whose name says "force".
foreach ($fn in @('delete_fixed_asset_completely', 'force_delete_all_depreciation_schedules')) {
    if ($m -notmatch "\('$fn',\s*'fixed_assets',\s*'p_asset_id',\s*true\)") {
        Write-Host "X $fn is not flagged to protect posted entries" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ both asset deleters protected" -ForegroundColor Green

$pairs = [regex]::Matches($m, "\('([a-z_0-9]+)',\s*'([a-z_0-9]+)',\s*'(p_[a-z_]+)',\s*(true|false)\)")
if ($pairs.Count -ne 4) {
    Write-Host "X expected 4 mappings in this batch, found $($pairs.Count)" -ForegroundColor Red; exit 1
}
Write-Host "+ 4 mappings intact" -ForegroundColor Green

if ($m -notmatch "RAISE EXCEPTION 'no BEGIN found in %'") {
    Write-Host "X the patcher skips silently" -ForegroundColor Red; exit 1
}
Write-Host "+ patcher fails loudly" -ForegroundColor Green

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

git add -- "lib/version.ts" "CHANGELOG.md" "$mig" "push_v3.74.748.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.747.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_748.txt"
    $msgLines = @(
        'security: v3.74.748 - ledger functions fully guarded, 19 of 19',
        '',
        'The four I held back in v3.74.747 were described as "loading their data',
        'differently". That was not accurate. They use table aliases -',
        '"FROM purchase_returns pr WHERE pr.id = ..." - and my extraction pattern',
        'required no alias. Nothing unusual about them; my regex was narrow, and I',
        'reported my own limitation as a property of the code.',
        '',
        'Read properly, all four name their table plainly: purchase_returns,',
        'customer_refund_requests, and fixed_assets twice.',
        '',
        'And a real defect underneath. delete_fixed_asset_completely and',
        'force_delete_all_depreciation_schedules both collect the journal entries',
        'behind an asset''s depreciation and delete them, lines then entries. The',
        'second even counts the POSTED ones into v_posted_count - and then proceeds',
        'anyway. The count is gathered and never used for anything.',
        '',
        'Deleting a posted depreciation entry removes the record that depreciation',
        'was ever charged. The accounts then disagree with the asset register with',
        'nothing to explain the gap. Posted entries are corrected by reversal.',
        '',
        'The refusal keeps the legitimate case - deleting an asset created by',
        'mistake and never posted - and blocks the destructive one with a message',
        'saying why. It raises 57014 rather than 42501 so a WHEN OTHERS handler',
        'cannot swallow it, per v3.74.730. The module holds zero assets, so nothing',
        'existing is affected; this is about the first time it gets used.',
        '',
        'One false positive of my own, caught by checking: after the injection my',
        'audit query showed three ledger-touching functions still unguarded. All',
        'three are read-only - including the guard I had just written. I had',
        'dropped the write filter from that particular query. No gap; the query was',
        'wrong.',
        '',
        'Ledger-touching writers: 19 of 19 guarded. Overall counter 48 to 29, and',
        'the remaining 29 do not touch the ledger - notifications, approvals, FIFO',
        'maintenance.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.748 pushed - every ledger function now checks membership" -ForegroundColor Green
}
