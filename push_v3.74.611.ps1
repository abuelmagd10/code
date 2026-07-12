$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.610.ps1") { Remove-Item -LiteralPath "push_v3.74.610.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.611"') {
    Write-Host "+ 3.74.611" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- Security hardening self-checks (v3.74.611) ---
$guard = Get-Content -LiteralPath "lib/core/security/api-guard.ts" -Raw
if ($guard -notmatch 'checkPermission\(supabase') {
    Write-Host "X api-guard RBAC enforcement missing" -ForegroundColor Red; exit 1
}
$authz = Get-Content -LiteralPath "lib/authz.ts" -Raw
if ($authz -notmatch '"owner", "admin", "general_manager"') {
    Write-Host "X general_manager full-access bypass missing" -ForegroundColor Red; exit 1
}
$manual = Get-Content -LiteralPath "app/api/journal-entries/manual/route.ts" -Raw
if ($manual -notmatch 'general_manager' -or $manual -notmatch 'forbidden') {
    Write-Host "X manual-journal owner/GM gate missing" -ForegroundColor Red; exit 1
}
Write-Host "+ security guards present (apiGuard RBAC, GM=owner, manual journals owner/GM only)" -ForegroundColor Green

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
    "lib/version.ts" `
    "lib/authz.ts" `
    "lib/core/security/api-guard.ts" `
    "app/api/journal-entries/manual/route.ts" `
    "app/api/balance-sheet-audit/route.ts" `
    "app/api/subscription/users/route.ts" `
    "app/api/accept-membership/route.ts" `
    "app/api/biometric/device/sync/route.ts" `
    "app/api/delete-transfers/route.ts" `
    "app/api/auto-fix-remaining-payments/route.ts" `
    "app/api/fix-negative-payments/route.ts" `
    "app/api/get-payment-details/route.ts" `
    "app/api/inspect-negative-payments/route.ts" `
    "app/api/fix-nasr-stock/route.ts" `
    "app/api/check-warehouse-stock/route.ts" `
    "app/api/fixed-assets/db-status/route.ts" `
    "app/api/fixed-assets/diagnose-depreciation/route.ts" `
    "app/api/accounting-audit/route.ts" `
    "knowledge/modules/accounting.md" `
    "knowledge/business-rules.md" `
    "knowledge/rbac-permissions-sod.md" `
    "knowledge/index.md" `
    "knowledge/knowledge-report.md" `
    "knowledge/governance/critical-findings-triage.md" `
    "push_v3.74.611.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.610.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_611.txt"
    $msgLines = @(
        'security(rbac): v3.74.611 - close CRITICAL API auth gaps + enforce apiGuard RBAC',
        '',
        'Owner-approved security hardening from the governance audit triage',
        '(knowledge/governance/critical-findings-triage.md):',
        '',
        '- Retired 5 orphan service-role maintenance/diagnostic endpoints',
        '  (fix-nasr-stock, check-warehouse-stock, fixed-assets/db-status,',
        '  fixed-assets/diagnose-depreciation, accounting-audit) -> 410 Gone.',
        '- Gated real service-role endpoints with @/lib/api-security helpers:',
        '  subscription/users, biometric/device/sync, auto-fix-remaining-payments,',
        '  fix-negative-payments, get-payment-details, inspect-negative-payments',
        '  (owner/admin), delete-transfers (auth+company, company-scoped).',
        '- accept-membership now verifies the caller session matches the',
        '  claimed userId/email (no acting on behalf of others).',
        '- balance-sheet-audit now requires financial_reports:read.',
        '- api-guard.ts: implemented the RBAC block (was a TODO stub) via',
        '  checkPermission; deny-by-default with owner/admin bypass.',
        '- authz.ts: general_manager granted full access (= owner) per',
        '  owner decision. manager stays read-only; accountant cannot write',
        '  products.',
        '- Manual journal entries (api/journal-entries/manual) restricted to',
        '  owner + general_manager only.',
        '',
        'Also ships Knowledge Base additions: business-rules.md,',
        'rbac-permissions-sod.md, governance triage, accounting.md table-name',
        'corrections.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.611 pushed - CRITICAL auth gaps closed, RBAC enforced" -ForegroundColor Green
}
