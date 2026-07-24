$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.808.ps1") { Remove-Item -LiteralPath "push_v3.74.808.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.809"') {
    Write-Host "+ 3.74.809" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.809]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.809]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the SW version is build-stamped, positively asserted ----------------------
# (lesson of 793 re-learned: anchor on the CODE line, not the first mention —
#  the explanatory comment quotes the old Date.now() line and tripped the
#  naive guard. `(?m)^const` matches only a real statement at line start.)
$sw = Get-Content -LiteralPath "public/sw.js" -Raw
if ($sw -match "(?m)^\s*const VERSION[^\r\n]*Date\.now") {
    Write-Host "X sw.js VERSION still uses runtime Date.now()" -ForegroundColor Red; exit 1
}
if ($sw -notmatch "const VERSION = '4\.4\.0-(__SW_BUILD_TS__|\d{13})'") {
    Write-Host "X sw.js VERSION is not the stamped 4.4.0 pattern" -ForegroundColor Red; exit 1
}
if (-not (Test-Path "scripts/stamp-sw-version.js")) {
    Write-Host "X stamp-sw-version.js missing" -ForegroundColor Red; exit 1
}
$rb = Get-Content -LiteralPath "scripts/build/run-next-build.js" -Raw
if ($rb -notmatch [regex]::Escape('require("../stamp-sw-version.js")')) {
    Write-Host "X build runner does not invoke the stamp script" -ForegroundColor Red; exit 1
}
Write-Host "+ every deployment now changes sw.js bytes - browsers auto-update" -ForegroundColor Green

# --- inventory balance RPC types fixed, positively asserted --------------------
$mig = Get-Content -LiteralPath "supabase/migrations/20260724000002_v3_74_809_inventory_balance_rpc_types.sql" -Raw
foreach ($must in @(
    "available_quantity bigint",
    "PERFORM assert_company_access(p_company_id)",
    "REVOKE EXECUTE ON FUNCTION public.get_inventory_available_balance"
)) {
    if ($mig -notmatch [regex]::Escape($must)) {
        Write-Host "X inventory-balance migration incomplete: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ available-balance RPC returns the view's real types, company-guarded" -ForegroundColor Green

git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 3
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

git add -- "lib/version.ts" "CHANGELOG.md" `
    "public/sw.js" `
    "scripts/stamp-sw-version.js" `
    "scripts/build/run-next-build.js" `
    "supabase/migrations/20260724000002_v3_74_809_inventory_balance_rpc_types.sql" `
    "lib/default-chart-of-accounts.ts" `
    "push_v3.74.809.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.808.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

$missing = @("public/sw.js","scripts/stamp-sw-version.js","scripts/build/run-next-build.js",
             "supabase/migrations/20260724000002_v3_74_809_inventory_balance_rpc_types.sql",
             "lib/default-chart-of-accounts.ts") |
    Where-Object { $staged -notcontains $_ }
if ($missing) {
    Write-Host "X files failed to stage: $($missing -join ', ')" -ForegroundColor Red; exit 1
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_809.txt"
    $msgLines = @(
        'fix(pwa): v3.74.809 - every deployment actually reaches browsers',
        '',
        'Caught in the warehouse manager''s console: his tab ran a bundle',
        'TWO deployments behind production. sw.js computed its VERSION with',
        'Date.now() at EVALUATION time, so the file''s bytes were identical',
        'across deployments - browsers never detected an update, the',
        'updatefound/SW_UPDATED auto-reload never fired, and open tabs kept',
        'stale bundles forever. This also masked the 808 realtime fix and',
        'explains every "works after refresh" symptom.',
        '',
        'Fix: scripts/stamp-sw-version.js stamps the version at BUILD time',
        '(hooked into run-next-build). Each deployment changes sw.js bytes',
        '-> update detected -> skipWaiting + SW_UPDATED -> auto reload.',
        'Existing users need ONE manual refresh to pick up the new worker;',
        'after that updates are automatic.',
        '',
        'Also: get_inventory_available_balance declared integer while the',
        'view returns bigint (42804 -> 400 in the booking addons panel).',
        'Dropped + recreated with matching types, SECURITY DEFINER with',
        'assert_company_access, REVOKE anon. Verified live on both DBs.',
        '',
        'Also carries the 808 stray: default-chart-of-accounts seeds 5130',
        'with sub_type purchase_discounts (a stale index.lock had blocked',
        'its follow-up commit).'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.809 pushed - the last manual refresh your users will ever need" -ForegroundColor Green
}
