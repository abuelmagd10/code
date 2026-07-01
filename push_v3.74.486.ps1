$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.485.ps1") { Remove-Item -LiteralPath "push_v3.74.485.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.486"') {
    Write-Host "+ 3.74.486" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000486_v3_74_486_role_tabs.sql")) {
    Write-Host "X migration 486 missing" -ForegroundColor Red; exit 1
}

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'roleTabs' -or $page -notmatch 'canShow') {
    Write-Host "X approvals page missing role-based tab filtering" -ForegroundColor Red; exit 1
}
if ($page -notmatch 'hasNoApprovalRole' -or $page -notmatch 'لا توجد اعتمادات لدورك') {
    Write-Host "X approvals page missing no-access gate" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page filters tabs by role + guards empty roles" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_486.txt"
    $msgLines = @(
        'feat(inbox): v3.74.486 - role-scoped tab visibility on the approvals inbox',
        '',
        'Owner reviewed the empty tab bar the warehouse manager saw and',
        'signed off on a role-specific matrix. Each role now sees only the',
        'tabs relevant to the workflows it participates in.',
        '',
        'owner / admin / general_manager: every tab',
        'store_manager: recv, disp, wo, tr, sret',
        'manufacturing_officer: bom, routing, po, mi',
        'accountant: disc, pay, pret, sret, cref, vcor, misc',
        'purchasing_officer: pret, disc, misc',
        'manager (branch): disc, pay, pret, sret, cref, vcor, disp,',
        '                  recv, wo, tr, misc',
        'staff, booking_officer: no approval workflows -> friendly',
        '                        "no approvals for your role" gate.',
        '',
        'Row-level filtering (branch/warehouse) still runs at the DB',
        'layer via RLS + get_user_approval_badges.',
        '',
        'Files',
        '  supabase/migrations/20260701000486_v3_74_486_role_tabs.sql',
        '  app/approvals/page.tsx',
        '  CONTRACTS.md (Section CG added)',
        '  lib/version.ts -> 3.74.486'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.486 pushed - tabs are now role-scoped" -ForegroundColor Green
}
