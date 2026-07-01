$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.481.ps1") { Remove-Item -LiteralPath "push_v3.74.481.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.482"') {
    Write-Host "+ 3.74.482" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000482_v3_74_482_sidebar_promotion.sql")) {
    Write-Host "X migration 482 missing" -ForegroundColor Red; exit 1
}

$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sb -notmatch "key: 'approvals'" -or $sb -notmatch 'v3\.74\.482') {
    Write-Host "X sidebar missing top-level approvals group" -ForegroundColor Red; exit 1
}
if ($sb -notmatch 'Purchase Requests') {
    Write-Host "X sidebar missing Purchase Requests link" -ForegroundColor Red; exit 1
}
Write-Host "+ sidebar has top-level approvals + purchase requests" -ForegroundColor Green

$us = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($us -notmatch 'صندوق الموافقات' -or $us -notmatch 'approvals:') {
    Write-Host "X role permissions grid missing approvals group" -ForegroundColor Red; exit 1
}
Write-Host "+ role permissions grid promotes approvals" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_482.txt"
    $msgLines = @(
        'feat(sidebar): v3.74.482 - promote Approval Inbox + fix role grid + reorder Purchases',
        '',
        'Owner asked three things:',
        '  1. Why do individual approval pages still exist? Because they',
        '     have create/edit/delete/void/filter/advanced beyond the',
        '     inbox. The inbox is the decision surface; the pages are',
        '     the full CRUD surface. Both stay.',
        '  2. Move the Approval Inbox out of Manufacturing (its no longer',
        '     manufacturing-specific) - to right below Dashboard.',
        '  3. Dont forget the role permissions grid + the Purchases menu.',
        '',
        'Sidebar',
        '  * New top-level group "Approvals" with the inbox tile,',
        '    directly below the Dashboard group.',
        '  * Manufacturing group no longer contains the inbox link.',
        '  * Purchases group re-ordered along the natural workflow:',
        '      Suppliers -> Purchase Requests -> Purchase Orders ->',
        '      Bills -> Returns -> Vendor Credits -> Corrections.',
        '    Fixed: Purchase Requests was missing entirely. Fixed:',
        '    Purchase Orders was displaying the purchase_request badge',
        '    (double-counting PRs). Cleared.',
        '',
        'Settings > Users > Role Permissions',
        '  * The approvals resource moved out of Manufacturing into its',
        '    own top-level Approvals group with an expanded label',
        '    listing every category the inbox unifies.',
        '',
        'No DB changes.',
        '',
        'Files',
        '  supabase/migrations/20260701000482_v3_74_482_sidebar_promotion.sql',
        '  components/sidebar.tsx',
        '  app/settings/users/page.tsx',
        '  CONTRACTS.md (Section CC added)',
        '  lib/version.ts -> 3.74.482'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.482 pushed - sidebar + role grid + purchases cleaned" -ForegroundColor Green
}
