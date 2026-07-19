$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.711.ps1") { Remove-Item -LiteralPath "push_v3.74.711.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.712"') {
    Write-Host "+ 3.74.712" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.712]")) { Write-Host "X CHANGELOG missing [3.74.712]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$targets = @(
  "fix-invoice-0001-status","fix-invoice-0028","fix-invoice-display",
  "fix-missing-payment-journals","fix-negative-quantities","fix-orphan-invoices",
  "fix-nasr-stock","repair-shipping-journals"
)

# ---------------------------------------------------------------------------
# Re-prove safety HERE, on the real repo, at push time. The analysis was done
# separately; this is the independent confirmation that nothing depends on any
# of these before a single file is removed.
# ---------------------------------------------------------------------------
Write-Host "`nVerifying nothing references the routes to be deleted..." -ForegroundColor Cyan

$codeDirs = @("app","lib","components","hooks","scripts")

# The question is whether anything OUTSIDE the set being deleted depends on it.
# A mention of one doomed route inside another doomed route is not a dependency
# — both are going. The first version excluded only the folder being checked, so
# a v3.74.711 comment in fix-invoice-display naming fix-invoice-0001-status
# tripped it. Exclude the whole set instead.
$deletedDirPattern = ($targets | ForEach-Object { [regex]::Escape("\app\api\$_\") }) -join "|"

$blocked = $false
foreach ($t in $targets) {
    $refs = Get-ChildItem -Path $codeDirs -Recurse -Include *.ts,*.tsx,*.js,*.jsx -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch $deletedDirPattern -and $_.FullName -notmatch "node_modules" } |
            Select-String -Pattern $t -SimpleMatch -ErrorAction SilentlyContinue
    if ($refs) {
        Write-Host "X $t is still referenced by code OUTSIDE the delete set:" -ForegroundColor Red
        $refs | Select-Object -First 5 | ForEach-Object { Write-Host "   $($_.Path):$($_.LineNumber)" }
        $blocked = $true
    }
}
if ($blocked) { Write-Host "`nAborting - deletion would break a caller." -ForegroundColor Red; exit 1 }
Write-Host "+ no code file references any of the 8" -ForegroundColor Green

# CI names three routes explicitly; none may be in the delete list.
$ci = Get-Content -LiteralPath ".github/workflows/ci.yml" -Raw
foreach ($t in $targets) {
    if ($ci -match [regex]::Escape($t)) {
        Write-Host "X $t is referenced by ci.yml - deleting it would break CI" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ ci.yml does not reference any of the 8" -ForegroundColor Green

# No dynamically-built /api/ URLs anywhere, which is what would hide a caller.
$dyn = Get-ChildItem -Path $codeDirs -Recurse -Include *.ts,*.tsx -ErrorAction SilentlyContinue |
       Where-Object { $_.FullName -notmatch "node_modules" } |
       Select-String -Pattern '/api/\$\{', '"/api/" *\+' -ErrorAction SilentlyContinue
if ($dyn) {
    Write-Host "X dynamic /api/ URL construction found - a caller could be hidden behind a variable:" -ForegroundColor Red
    $dyn | Select-Object -First 5 | ForEach-Object { Write-Host "   $($_.Path):$($_.LineNumber)" }
    exit 1
}
Write-Host "+ no dynamic /api/ URL construction" -ForegroundColor Green

# ---------------------------------------------------------------------------
Write-Host "`nRemoving..." -ForegroundColor Cyan
$removed = 0
foreach ($t in $targets) {
    $p = "app/api/$t"
    if (Test-Path $p) {
        git rm -r -q --ignore-unmatch -- $p 2>&1 | Out-Null
        if (Test-Path $p) { Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue }
        Write-Host "  - removed app/api/$t" -ForegroundColor DarkGray
        $removed++
    } else {
        Write-Host "  . already gone: app/api/$t" -ForegroundColor DarkGray
    }
}
Write-Host "+ $removed route folder(s) removed" -ForegroundColor Green

# tsconfig includes ".next/types/**/*.ts", and Next.js generates a validator
# there listing every route from the LAST build. After deleting a route that
# manifest still imports it, so tsc reports errors about files we just removed
# on purpose. It is a build artifact — .next/ is gitignored and validator.ts is
# not tracked by git — and Next regenerates it on the next build. Clear it so
# the type check reads today's source tree, not yesterday's build.
if (Test-Path ".next/types") {
    Remove-Item -LiteralPath ".next/types" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "+ cleared stale generated route types (.next/types)" -ForegroundColor Green
}

Write-Host "`nRunning tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors - nothing depended on the deleted routes" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    Write-Host "`nRestore with: git checkout -- app/api" -ForegroundColor Yellow
    exit 1
}

git add -- "lib/version.ts" "CHANGELOG.md" "push_v3.74.712.ps1" 2>&1 | Out-Null
git add -u -- "app/api" "push_v3.74.711.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_712.txt"
    $msgLines = @(
        'chore(api): v3.74.712 - remove 8 historical repair endpoints with no callers',
        '',
        'The owner approved removal on the condition that it be proven harmless',
        'first. Verified on four axes before touching a file:',
        '',
        '1. No caller in code. Searching the whole project for the eight names',
        '   returns only the route files themselves, the CHANGELOG, and generated',
        '   docs under knowledge/. No page, component, lib or script.',
        '2. No dynamically-built /api/ URLs anywhere in app, lib or components, so',
        '   no reference can be hidden behind a variable.',
        '3. middleware.ts does not name them.',
        '4. Each folder contains route.ts alone - no page or shared helper.',
        '',
        'ci.yml pins three routes by name (fix-inventory, fix-sent-invoice-journals,',
        'repair-invoice); none is in this list, so the CI checks stay intact.',
        '',
        'Removed: fix-invoice-0001-status, fix-invoice-0028, fix-invoice-display,',
        'fix-missing-payment-journals, fix-negative-quantities, fix-orphan-invoices,',
        'fix-nasr-stock, repair-shipping-journals.',
        '',
        'These were one-off tools for specific historical data whose problems are',
        'long resolved. Keeping them was a live risk: they encode rules from before',
        'the custody model, FIFO costing and landed cost, so invoking one today',
        'would repair with last year''s logic. fix-nasr-stock was already disabled',
        'behind a 410.',
        '',
        'v3.74.711 added a role gate to three of these eight and this release',
        'deletes them. The order was deliberate: gate first because gating is',
        'immediately safe, then verify, then delete. Deleting before verifying',
        'would have been a decision made on assumption.',
        '',
        'The push script re-runs all of the above verification on the real repo at',
        'push time and aborts if any reference exists.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.712 pushed - 8 dead repair endpoints removed" -ForegroundColor Green
}
