$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.581.ps1") { Remove-Item -LiteralPath "push_v3.74.581.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.582"') {
    Write-Host "+ 3.74.582" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- markers ---
$idx = Get-Content -LiteralPath "app/reports/page.tsx" -Raw
if ($idx -notmatch 'ROLE_REPORT_MAP' -or $idx -notmatch 'isCardVisibleForRole') {
    Write-Host "X reports index role map missing" -ForegroundColor Red; exit 1
}
$usr = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($usr -notmatch 'clearUserPermissionCache') {
    Write-Host "X users page cache-clear wiring missing" -ForegroundColor Red; exit 1
}
Write-Host "+ role-based reports visibility markers present" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 30 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر — الرفع انتقائى حصراً
git add -- `
    "app/reports/page.tsx" `
    "app/settings/users/page.tsx" `
    "lib/version.ts" `
    "push_v3.74.582.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.581.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_582.txt"
    $msgLines = @(
        'feat(reports): v3.74.582 - role-relevant report cards + instant perm refresh',
        '',
        'Owner rule: each role sees only the reports that serve its job',
        '(server-side branch scoping from v3.74.581 still applies).',
        '',
        'Reports index (app/reports/page.tsx):',
        '- fresh member-role fetch on mount (never cached in storage)',
        '- ROLE_REPORT_MAP: owner/admin/GM = everything; manager/viewer =',
        '  all operational; accountant = sales+purchases+shipping set;',
        '  store_manager = inventory set (expiry/warehouse/count/audit);',
        '  purchasing_officer = purchase set + product-expiry;',
        '  booking_officer = bookings; manufacturing_officer =',
        '  manufacturing; unknown roles = none (friendly bilingual',
        '  empty-state)',
        '- module-shortcut cards (journal-entries/banking/inventory/hr/',
        '  fixed-assets/settings) = top management only',
        '- composes with the v3.74.581 financial_reports gate',
        '',
        'Branch/role change propagation:',
        '- verified: secureApiRequest reads company_members per request,',
        '  so branch changes apply on the next API call (no server cache)',
        '- settings/users now calls clearUserPermissionCache after role/',
        '  branch updates (authz client cache TTL was 60s) so changes',
        '  reflect instantly in the admin tab'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.582 pushed - role-relevant reports live" -ForegroundColor Green
}
