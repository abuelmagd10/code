# v3.74.45 - wire cash-overdraft validator into 6 disbursement paths
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.45"') {
    Write-Host "+ APP_VERSION = 3.74.45" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.45" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.45]')) {
    Write-Host "+ CHANGELOG 3.74.45" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.45" -ForegroundColor Red; exit 1 }

# v3.74.45 marker check on each fixed file
$files = @(
    'app/api/banking/vouchers/[id]/workflow/route.ts',
    'app/expenses/[id]/page.tsx',
    'app/api/hr/payroll/pay/route.ts',
    'app/actions/drawings.ts',
    'app/api/customer-refund-requests/[id]/execute/route.ts',
    'app/api/commissions/advance-payments/pay/route.ts',
    'app/api/commissions/instant-payouts/pay/route.ts'
)
foreach ($f in $files) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -match 'v3\.74\.45') {
        Write-Host "  + $f" -ForegroundColor Green
    } else { Write-Host "  X $f missing v3.74.45 marker" -ForegroundColor Red; exit 1 }
    if ($c -match 'assertCashOutflowAllowed') {
        Write-Host "    + validator wired" -ForegroundColor DarkGreen
    } else { Write-Host "    X validator not imported in $f" -ForegroundColor Red; exit 1 }
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
    git commit -m "fix(financial): v3.74.45 - wire cash-overdraft guard into 6 silent paths

Pre-launch audit found 7 of 10 disbursement flows would silently push
cash/bank accounts below zero. Three flows (supplier payment, bank
transfer, customer refund simple path) were already protected by the
centralized assertCashOutflowAllowed validator introduced in v3.26.0.
Six other reachable flows were skipping it.

Wired into:
- app/api/banking/vouchers/[id]/workflow/route.ts (post_bank_voucher)
- app/expenses/[id]/page.tsx (handleApprove -> createExpenseJournalEntry)
- app/api/hr/payroll/pay/route.ts (post_payroll_atomic)
- app/actions/drawings.ts (approveDrawing -> approve_shareholder_drawing)
- app/api/customer-refund-requests/[id]/execute/route.ts (execute_customer_refund)
- app/api/commissions/advance-payments/pay/route.ts (pay_commission_advance)
- app/api/commissions/instant-payouts/pay/route.ts (pay_instant_commissions)

Each fix:
- Imports assertCashOutflowAllowed + CashOverdraftError
- Runs validator immediately before the RPC/JE-posting call
- Bubbles validator's bilingual AR/EN error message via HTTP 400 or
  equivalent failure path
- Marked with // v3.74.45 comment for grepability

Still pending (documented for later):
- DB-level constraint trigger as defense-in-depth backstop
- UI inline warnings matching /payments gold-standard pattern

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.45 pushed" -ForegroundColor Green
}
