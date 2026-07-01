$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.483.ps1") { Remove-Item -LiteralPath "push_v3.74.483.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.484"') {
    Write-Host "+ 3.74.484" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000484_v3_74_484_inbox_for_warehouse.sql")) {
    Write-Host "X migration 484 missing" -ForegroundColor Red; exit 1
}

$nr = Get-Content -LiteralPath "lib/notification-routing.ts" -Raw
if ($nr -notmatch '/approvals\?tab=recv' -or $nr -notmatch '/approvals\?tab=disp') {
    Write-Host "X notification-routing not pointing at /approvals" -ForegroundColor Red; exit 1
}
Write-Host "+ receipt + dispatch notifications route to /approvals" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch "params.get\(""tab""\)") {
    Write-Host "X /approvals not honoring ?tab= param" -ForegroundColor Red; exit 1
}
Write-Host "+ /approvals honors ?tab= from notification links" -ForegroundColor Green

$us = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($us -notmatch "store_manager: \[\s*'approvals'") {
    Write-Host "X store_manager default missing 'approvals'" -ForegroundColor Red; exit 1
}
Write-Host "+ store_manager default includes 'approvals'" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_484.txt"
    $msgLines = @(
        'feat(inbox+notif): v3.74.484 - warehouse notifications route to /approvals + role defaults expanded',
        '',
        'Owner reminded: the warehouse manager notification should also',
        'land on the unified inbox (not the dedicated goods-receipt page).',
        '',
        'Notification routing',
        '  bill + receipt-pending event key -> /approvals?tab=recv&highlight=<id>',
        '  invoice + dispatch-pending event key -> /approvals?tab=disp&highlight=<id>',
        '  The dedicated pages still work via direct URL for the advanced',
        '  flows (approve-with-shipping, partial receipt, filters).',
        '',
        '/approvals page',
        '  Reads ?tab= on mount so notification links land on the exact',
        '  tab without an extra click.',
        '',
        'Default role permissions template (app/settings/users/page.tsx)',
        '  store_manager, accountant, purchasing_officer now include',
        '  approvals by default. Existing companies backfilled via a',
        '  SQL INSERT into company_role_permissions.',
        '',
        'Row filtering preserved: RLS on bills / invoices / write_offs /',
        'transfers keeps each users view scoped to their warehouse or',
        'branch, matching the predicates in get_user_approval_badges.',
        '',
        'Files',
        '  supabase/migrations/20260701000484_v3_74_484_inbox_for_warehouse.sql',
        '  lib/notification-routing.ts',
        '  app/approvals/page.tsx',
        '  app/settings/users/page.tsx',
        '  CONTRACTS.md (Section CE added)',
        '  lib/version.ts -> 3.74.484'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.484 pushed - warehouse notifications land on the unified inbox" -ForegroundColor Green
}
