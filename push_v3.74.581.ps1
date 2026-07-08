$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.580.ps1") { Remove-Item -LiteralPath "push_v3.74.580.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.581"') {
    Write-Host "+ 3.74.581" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- markers ---
$bac = Get-Content -LiteralPath "lib/branch-access-control.ts" -Raw
if ($bac -notmatch "general_manager") {
    Write-Host "X GM company-wide fix missing in branch-access-control" -ForegroundColor Red; exit 1
}
$idx = Get-Content -LiteralPath "app/reports/page.tsx" -Raw
if ($idx -notmatch "financial_reports") {
    Write-Host "X reports index gating missing" -ForegroundColor Red; exit 1
}
$inc = Get-Content -LiteralPath "app/api/income-statement/route.ts" -Raw
if ($inc -notmatch '"financial_reports"') {
    Write-Host "X income-statement not switched to financial_reports" -ForegroundColor Red; exit 1
}
if (-not (Test-Path "supabase/migrations/20260708000581_v3_74_581_reports_access_matrix.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ reports access matrix markers present" -ForegroundColor Green

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
$files = @(
    "lib/branch-access-control.ts",
    "lib/core/security/api-guard.ts",
    "app/reports/page.tsx",
    "app/reports/balance-sheet/page.tsx",
    "app/reports/balance-sheet-audit/page.tsx",
    "app/reports/bank-reconciliation/page.tsx",
    "app/reports/bank-transactions/page.tsx",
    "app/reports/bank-accounts-by-branch/page.tsx",
    "app/reports/ar-by-currency/page.tsx",
    "app/reports/branch-comparison/page.tsx",
    "app/reports/branch-cost-center/page.tsx",
    "app/reports/cost-center-analysis/page.tsx",
    "app/reports/dashboard/page.tsx",
    "app/reports/equity-changes/page.tsx",
    "app/reports/fx-gains-losses/page.tsx",
    "app/reports/sales-bonuses/page.tsx",
    "app/reports/update-account-balances/page.tsx",
    "app/api/income-statement/route.ts",
    "app/api/cash-flow/route.ts",
    "app/api/trial-balance/route.ts",
    "app/api/simple-report/route.ts",
    "app/api/vat-input/route.ts",
    "app/api/vat-output/route.ts",
    "app/api/daily-payments-receipts/route.ts",
    "app/api/aging-ap/route.ts",
    "app/api/aging-ap-base/route.ts",
    "app/api/aging-ap-gl/route.ts",
    "app/api/aging-ar/route.ts",
    "app/api/aging-ar-base/route.ts",
    "app/api/aging-ar-gl/route.ts",
    "app/api/accounting-validation/route.ts",
    "app/api/login-activity/route.ts",
    "app/api/financial-integrity-checks/route.ts",
    "app/api/financial-traces/route.ts",
    "app/api/inventory-valuation/route.ts",
    "app/api/financial-operations/replay/route.ts",
    "app/api/financial-operations/replay-calibration/route.ts",
    "app/api/financial-operations/replay-commit-intents/route.ts",
    "app/api/financial-operations/replay-coverage/route.ts",
    "app/api/financial-operations/replay-execute/route.ts",
    "app/api/financial-operations/replay-executions/route.ts",
    "app/api/financial-operations/replay-stabilization/route.ts",
    "app/api/financial-operations/replay-trace/route.ts",
    "supabase/migrations/20260708000581_v3_74_581_reports_access_matrix.sql",
    "lib/version.ts",
    "push_v3.74.581.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.580.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_581.txt"
    $msgLines = @(
        'feat(reports): v3.74.581 - branch-scoped reports + financial_reports gate',
        '',
        'Owner decisions:',
        '- operational report roles see reports for THEIR BRANCH only;',
        '  owner/admin/general_manager see company-wide',
        '- profit/financial reports stay top-management only (accountant',
        '  explicitly excluded)',
        '- branch-visible sales reports must not expose cost/margin',
        '  (audited: already clean, zero leaks found)',
        '',
        'DB (migration 20260708000581, already live via MCP):',
        '- resource "reports" granted (read) to general_manager, manager,',
        '  accountant, store_manager, purchasing_officer, booking_officer,',
        '  manufacturing_officer across all companies + auto-seed trigger',
        '- NEW resource "financial_reports": owner/admin/general_manager',
        '',
        'Code:',
        '- lib/branch-access-control.ts: general_manager added to',
        '  FULL_ACCESS_ROLES + build*Filter + checkBranchAccess (the',
        '  comments always said GM; the key was missing - same historic',
        '  mixup as v3.74.132)',
        '- 26 financial API routes switched to requirePermission',
        '  financial_reports (incl. inventory-valuation which also gains',
        '  general_manager in allowedRoles)',
        '- 14 financial report pages gated client-side (direct-supabase',
        '  or shared-API pages) with the standard deny pattern',
        '- reports index hides financial cards for unauthorized roles',
        '',
        'Known follow-ups (documented, not blocking):',
        '- /api/balance-sheet-audit has NO server guard (pre-existing);',
        '  page gated client-side for now',
        '- shared routes /api/account-balances, /api/account-lines,',
        '  /api/bonuses keep their own resources (serve other modules)'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.581 pushed - reports access matrix live" -ForegroundColor Green
}
