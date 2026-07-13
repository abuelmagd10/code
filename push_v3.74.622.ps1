$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.621.ps1") { Remove-Item -LiteralPath "push_v3.74.621.ps1" -Force }
# Remove stray temp files left by tooling (untracked, but keep the tree clean)
foreach ($tmp in @("tsconfig.payments-check.json","tsconfig.pcheck2.json","vc_tsc_full.txt","vc_tsc_result.txt")) {
    if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
}

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.622"') {
    Write-Host "+ 3.74.622" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pages = @(
    "app/payments/page.tsx",
    "app/journal-entries/page.tsx",
    "app/inventory/page.tsx",
    "app/inventory-transfers/page.tsx",
    "app/customer-credits/page.tsx",
    "app/vendor-credits/page.tsx",
    "app/estimates/page.tsx",
    "app/fixed-assets/page.tsx",
    "app/banking/page.tsx",
    "app/accounting/periods/page.tsx",
    "app/accounting/period-closing/page.tsx",
    "app/hr/employees/page.tsx",
    "app/hr/payroll/page.tsx",
    "app/settings/seats/page.tsx",
    "app/settings/shipping/page.tsx"
)
foreach ($p in $pages) {
    if (-not (Test-Path $p)) { Write-Host "X missing $p" -ForegroundColor Red; exit 1 }
    $c = Get-Content -LiteralPath $p -Raw
    if ($c -notmatch 'components/DataTable') {
        Write-Host "X $p was not converted to DataTable" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all 15 pages import the standard DataTable" -ForegroundColor Green

Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump failed (check .env.local). Aborting." -ForegroundColor Red; exit 1 }

Write-Host "Running tsc (validates all converted pages)..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing. Paste these to fix:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 60 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر — الرفع انتقائى حصراً
$addArgs = @("add","--") + $pages + @("lib/version.ts","supabase/schema/functions.sql","push_v3.74.622.ps1")
& git @addArgs 2>&1 | Out-Null
git add -u -- "push_v3.74.621.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_622.txt"
    $msgLines = @(
        'style(tables): v3.74.622 - unify all list tables on the standard DataTable',
        '',
        'Converts the remaining hand-rolled inline <table> lists to the shared',
        'DataTable + DataPagination pattern used by the invoices page, for a',
        'consistent look, sticky headers, status badges, responsive column',
        'hiding, and pagination across the app.',
        '',
        'Pages: payments (customer + supplier), journal-entries, inventory,',
        'inventory-transfers, customer-credits, vendor-credits, estimates,',
        'fixed-assets, banking, accounting/periods, accounting/period-closing,',
        'hr/employees, hr/payroll, settings/seats, settings/shipping.',
        '',
        'Presentation only - no data fetching, business logic, or handlers',
        'changed. sent-invoice-returns left as-is (entry form, not a list).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.622 pushed - all list tables unified" -ForegroundColor Green
}
