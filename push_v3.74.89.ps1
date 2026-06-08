# v3.74.89 - /customers + customer-form-dialog: subtract applied_amount in credit-balance calc
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.89"') { Write-Host "+ APP_VERSION = 3.74.89" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.89" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.89]')) { Write-Host "+ CHANGELOG 3.74.89" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.89" -ForegroundColor Red; exit 1 }

$f1 = Get-Content -LiteralPath "app/customers/page.tsx" -Raw
$f1Lines = ($f1 -split "`n").Count
if ($f1Lines -ge 1490) { Write-Host "+ customers/page.tsx intact ($f1Lines lines)" -ForegroundColor Green } else { Write-Host "X customers/page.tsx truncated ($f1Lines lines)" -ForegroundColor Red; exit 1 }
if ($f1.TrimEnd().EndsWith("}")) { Write-Host "+ customers/page.tsx ends with }" -ForegroundColor Green } else { exit 1 }
if ($f1 -match 'applied_amount') { Write-Host "+ customers/page.tsx selects applied_amount" -ForegroundColor Green } else { Write-Host "X applied_amount missing in customers/page.tsx" -ForegroundColor Red; exit 1 }
if ($f1 -match 'v3\.74\.89') { Write-Host "+ v3.74.89 marker in customers/page.tsx" -ForegroundColor Green } else { Write-Host "X marker missing" -ForegroundColor Red; exit 1 }

$f2 = Get-Content -LiteralPath "components/customers/customer-form-dialog.tsx" -Raw
$f2Lines = ($f2 -split "`n").Count
if ($f2Lines -ge 890) { Write-Host "+ customer-form-dialog intact ($f2Lines lines)" -ForegroundColor Green } else { Write-Host "X customer-form-dialog truncated ($f2Lines lines)" -ForegroundColor Red; exit 1 }
if ($f2.TrimEnd().EndsWith("}")) { Write-Host "+ customer-form-dialog ends with }" -ForegroundColor Green } else { exit 1 }
if ($f2 -match 'applied_amount') { Write-Host "+ customer-form-dialog selects applied_amount" -ForegroundColor Green } else { Write-Host "X applied_amount missing in customer-form-dialog" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "customers/page\.tsx|customer-form-dialog").Count
if ($err -eq 0) { Write-Host "+ 0 errors in touched files" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; $tsc | Select-String -Pattern "customers/page\.tsx|customer-form-dialog" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(customer-credit-display): v3.74.89 - subtract applied_amount in /customers and customer-form-dialog

After v3.74.88 the invoice page reflected credit applications correctly,
but /customers still showed the pre-application balance.

Root cause (full audit done):
customer_credits has two columns that both reduce available balance:
- used_amount: bumped when credit is disbursed in cash
- applied_amount: bumped when credit is applied to an invoice (the
  apply_customer_credit_to_invoice RPC writes here)

A sweep across the project found two display sites subtracting only
used_amount:
1. app/customers/page.tsx (SELECT + calc)
2. components/customers/customer-form-dialog.tsx (SELECT + calc, used
   by the edit-customer lock badge)

For amount=10, used=0, applied=5: both computed 10 instead of 5.

All other surfaces verified correct: /invoices list and detail page,
/payments (CustomerCreditBalanceHint), /customer-credits/* (all read
through customer_credit_ledger, which is the unified post-v3.74.76
source and already nets everything).

Fixed both files: SELECT adds applied_amount; available = amount -
used - applied. The 'disbursed' total in /customers now correctly sums
used + applied so neither type of consumption hides from that figure.

TS: 0 errors. Both files restored from HEAD then re-applied via
heredoc with anchor assertions because Edit truncated each tail.

Legacy app/api/fix-invoice-0001-status/route.ts has the same old
pattern but it's a one-shot repair script, not user-facing - left." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.89 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.88.ps1') { Remove-Item -LiteralPath 'push_v3.74.88.ps1' -Force }
}
