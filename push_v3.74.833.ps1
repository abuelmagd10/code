$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.832.ps1") { Remove-Item -LiteralPath "push_v3.74.832.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.833"') {
    Write-Host "+ 3.74.833" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.833]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.833]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$files = @(
    "lib/version.ts",
    "CHANGELOG.md",
    "app/api/manufacturing/production-orders/[id]/request-product-receive/route.ts",
    "supabase/migrations/20260726000004_v3_74_833_release_freezes_material_snapshot.sql",
    "push_v3.74.833.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.832.ps1" 2>$null

$m = Get-Content -LiteralPath "supabase/migrations/20260726000004_v3_74_833_release_freezes_material_snapshot.sql" -Raw

# --- (a) release actually calls the sync, in the same transaction -------------
if ($m -notmatch [regex]::Escape("v_sync := public.mpoe_sync_materials_internal(p_company_id, p_production_order_id, p_updated_by);")) {
    Write-Host "X release does not freeze the material snapshot - the gap is still open" -ForegroundColor Red; exit 1
}
Write-Host "+ release freezes the snapshot and reserves stock in the same transaction" -ForegroundColor Green

# --- (b) the preconditions are checked BEFORE the status update ---------------
$posCostCentre = $m.IndexOf("v_warehouse.cost_center_id IS NULL")
$posUpdate     = $m.IndexOf("SET status = 'released'")
if ($posCostCentre -lt 0 -or $posUpdate -lt 0) {
    Write-Host "X could not locate the precondition check or the status update" -ForegroundColor Red; exit 1
}
if ($posCostCentre -gt $posUpdate) {
    Write-Host "X the cost-centre check runs AFTER the release - it must run before" -ForegroundColor Red; exit 1
}
Write-Host "+ the release preconditions are checked before the order is released" -ForegroundColor Green

# --- (c) receipt refuses when no material was issued -------------------------
if ($m -notmatch [regex]::Escape("PERFORM public.mpoe_assert_materials_issued_before_receipt(p_production_order_id);")) {
    Write-Host "X the receipt path does not require issued materials - cost would be understated" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("لا يمكن استلام المنتج التام قبل صرف خاماته")) {
    Write-Host "X the issued-materials guard message is missing" -ForegroundColor Red; exit 1
}
Write-Host "+ a finished product cannot be received before its materials are issued" -ForegroundColor Green

# --- (d) the API refuses the request at creation ------------------------------
$r = Get-Content -LiteralPath "app/api/manufacturing/production-orders/[id]/request-product-receive/route.ts" -Raw
if ($r -notmatch [regex]::Escape('.from("production_order_material_requirements")')) {
    Write-Host "X the request route still creates unfulfillable receipt requests" -ForegroundColor Red; exit 1
}
if ($r -notmatch [regex]::Escape("لا يمكن طلب استلام المنتج التام قبل صرف خاماته")) {
    Write-Host "X the route-level Arabic refusal is missing" -ForegroundColor Red; exit 1
}
Write-Host "+ the receipt request is refused at creation, in Arabic, not after approval" -ForegroundColor Green

# --- (e) the data repair is present and does not abort the migration ---------
if ($m -notmatch [regex]::Escape("EXCEPTION WHEN OTHERS THEN")) {
    Write-Host "X one unpreparable order would abort the whole migration" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("WHERE po.status IN ('released', 'in_progress')")) {
    Write-Host "X the data repair does not target released/in-progress orders" -ForegroundColor Red; exit 1
}
Write-Host "+ existing snapshot-less orders are repaired, warnings not aborts" -ForegroundColor Green

# --- (f) every guard message is bilingual ------------------------------------
$cv = ([regex]::Matches($m, [regex]::Escape("check_violation"))).Count
if ($cv -lt 6) { Write-Host "X only $cv guard messages carry check_violation (expected 6+)" -ForegroundColor Red; exit 1 }
$pipes = ([regex]::Matches($m, " \| ")).Count
if ($pipes -lt 6) { Write-Host "X only $pipes messages look bilingual" -ForegroundColor Red; exit 1 }
Write-Host "+ $cv guard messages, all bilingual" -ForegroundColor Green

Write-Host "Verifying the lockfile matches package.json..." -ForegroundColor Cyan
node scripts/check-lockfile-in-sync.js
if ($LASTEXITCODE -ne 0) { Write-Host "X lockfile check failed" -ForegroundColor Red; exit 1 }

Write-Host "Verifying referenced scripts and their inputs are committed..." -ForegroundColor Cyan
node scripts/check-referenced-scripts-tracked.js
if ($LASTEXITCODE -ne 0) { Write-Host "X referenced-scripts check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column writes..." -ForegroundColor Cyan
node scripts/check-phantom-columns.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-column check failed" -ForegroundColor Red; exit 1 }

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

git add -- $files 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_833.txt"
    $msgLines = @(
        'fix(manufacturing): v3.74.833 - release freezes the material snapshot and',
        'reserves stock; no receipt before materials are issued',
        '',
        'The worst thing the live test has surfaced so far.',
        '',
        'GAP 1 - the material requirements snapshot was never created in real use.',
        '',
        'The snapshot is the bill of materials FROZEN onto the order at release,',
        'so that editing the BOM tomorrow does not change an order already on the',
        'floor; the inventory reservation is built on it. It was created in',
        'exactly one place - POST .../[id]/sync-materials - and searching the',
        'whole project shows that endpoint is called ONLY by test files. No',
        'button, no other route, and not by release. So in practice:',
        '',
        '  - no snapshot  => material issue and product receipt both refused, in',
        '                    raw English, at the very end of the chain',
        '  - no reservation => the same stock stays sellable and issuable to',
        '                    another order while it is committed to a live',
        '                    production order - a double commitment',
        '',
        'And the worst part: the golden-path integration test was GREEN, because',
        'it calls sync-materials itself. A test walking a road no user can walk.',
        '',
        'Release now freezes the snapshot and reserves stock in the SAME',
        'transaction: either the order is released with its materials committed,',
        'or it is not released. The preconditions are checked in Arabic before',
        'the release (BOM version linked, issue warehouse has a cost centre, the',
        'BOM has component lines). A stock shortage cannot break it - the',
        'reservation takes what is free and does not fail.',
        '',
        'GAP 2 - a finished product could be received with no materials issued.',
        '',
        'The receipt function never checked. Cost of finished output = materials',
        '+ conversion, so receiving with nothing issued capitalises the product',
        'understated while the raw materials stay on the books as if never',
        'consumed - and the profit on sale is fictitious. A new guard refuses',
        'it, and the request route refuses at creation (422) rather than sending',
        'the warehouse keeper a notification for a request that cannot succeed.',
        '',
        'Deliberately recorded scope: the guard is "nothing issued at all".',
        'Proportional coverage of received quantity against issued materials',
        'needs the partial-issue design and was left out so as not to block a',
        'legitimate partial issue.',
        '',
        'Data repair: MPO-202607-000029 was in_progress with an empty snapshot -',
        'released without a reservation. Its materials were prepared (2',
        'components) and fully reserved. The migration does the same for any',
        'other order in that state, warning rather than aborting on ones it',
        'cannot prepare.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.833 pushed - a green test on a road no user walks is not a passing test" -ForegroundColor Green
}
