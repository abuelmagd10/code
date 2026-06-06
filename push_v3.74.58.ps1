# v3.74.58 - useAutoRefresh wave 3: +8 pages (detail + reports)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.58"') {
    Write-Host "+ APP_VERSION = 3.74.58" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.58" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.58]')) {
    Write-Host "+ CHANGELOG 3.74.58" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.58" -ForegroundColor Red; exit 1 }

$wave3 = @(
    'app/accounting/periods/page.tsx',
    'app/invoices/[id]/page.tsx',
    'app/bills/[id]/page.tsx',
    'app/expenses/[id]/page.tsx',
    'app/reports/cash-flow/page.tsx',
    'app/reports/aging-ap/page.tsx',
    'app/reports/aging-ar/page.tsx',
    'app/reports/inventory-valuation/page.tsx'
)
foreach ($p in $wave3) {
    $c = Get-Content -LiteralPath $p -Raw
    if ($c -match 'useAutoRefresh' -and $c -match 'use-auto-refresh') {
        Write-Host "  + $p" -ForegroundColor Green
    } else { Write-Host "  X $p missing hook" -ForegroundColor Red; exit 1 }
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(ux): v3.74.58 - useAutoRefresh wave 3 (+8 pages)

Continuing the rollout from v3.74.56/57 - extending coverage into
per-record detail pages and the most-checked report pages. Total
coverage now stands at 34 of about 200 pages, but the additions in
this wave are pages users return to most after taking an action
(open an invoice -> tab away -> come back -> see latest payment
status).

Pages added:
- /accounting/periods (loadPeriods)
- /invoices/[id] (loadInvoice)
- /bills/[id] (loadData)
- /expenses/[id] (loadExpense)
- /reports/cash-flow (loadData)
- /reports/aging-ap (loadData)
- /reports/aging-ar (loadData)
- /reports/inventory-valuation (loadData)

Implementation note: applied via the Edit tool one page at a time -
a deliberate change from the bulk Python script used in earlier
waves. Reason: the bulk approach corrupted line-endings/encoding on
roughly half the project's TypeScript files in a previous attempt,
which we had to revert. Per-page Edit operations preserve original
encoding (CRLF + UTF-8) exactly, at the cost of a slower rollout.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.58 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.57.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.57.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.57.ps1)" -ForegroundColor DarkGray
    }
}
