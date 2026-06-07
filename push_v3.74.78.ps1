# v3.74.78 - Credit source labels in 3 places (list / ledger / payments)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.78"') { Write-Host "+ APP_VERSION = 3.74.78" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.78" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.78]')) { Write-Host "+ CHANGELOG 3.74.78" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.78" -ForegroundColor Red; exit 1 }

$files = @(
    @{ Path = "app/invoices/page.tsx"; MinLines = 3125 },
    @{ Path = "app/customer-credits/[customerId]/page.tsx"; MinLines = 345 },
    @{ Path = "app/payments/page.tsx"; MinLines = 2920 }
)
foreach ($f in $files) {
    $content = Get-Content -LiteralPath $f.Path -Raw
    $lines = ($content -split "`n").Count
    if ($lines -ge $f.MinLines -and $content.TrimEnd().EndsWith("}")) {
        Write-Host "+ $($f.Path) intact ($lines lines)" -ForegroundColor Green
    } else {
        Write-Host "X $($f.Path) suspicious ($lines lines)" -ForegroundColor Red
        exit 1
    }
}

$inv = Get-Content -LiteralPath "app/invoices/page.tsx" -Raw
if ($inv -match 'customerCreditSources' -and $inv -match 'creditSource') {
    Write-Host "+ invoices page has source markers" -ForegroundColor Green
} else { Write-Host "X invoices markers missing" -ForegroundColor Red; exit 1 }

$ledger = Get-Content -LiteralPath "app/customer-credits/[customerId]/page.tsx" -Raw
if ($ledger -match 'overpayment.*Overpayment' -and $ledger -match 'manual_credit.*Manual Credit') {
    Write-Host "+ ledger page has new labels" -ForegroundColor Green
} else { Write-Host "X ledger labels missing" -ForegroundColor Red; exit 1 }

$pay = Get-Content -LiteralPath "app/payments/page.tsx" -Raw
if ($pay -match 'CustomerCreditBalanceHint' -and $pay -match '/api/customer-credits/') {
    Write-Host "+ payments page has credit hint component" -ForegroundColor Green
} else { Write-Host "X payments hint missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$pattern = "invoices/page\.tsx|customer-credits/.*page\.tsx|payments/page\.tsx"
$err = ($tsc | Select-String $pattern).Count
if ($err -eq 0) { Write-Host "+ 0 errors in touched files" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; $tsc | Select-String $pattern | Select-Object -First 5; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(credit): v3.74.78 - source labels in list/ledger + payments page hint

Three small post-deploy follow-ups to v3.74.77:

1. Invoice list 'Credit' column shows where each amount came from. A new
   state map customerCreditSources is loaded from active customer_credits
   rows (most recent per customer) and resolves to:
     - overpayment       -> فائض دفعة / overpayment
     - invoice_return    -> مرتجع INV-XXXX / return on INV-XXXX
     - sales_return      -> مرتجع مبيعات / sales return
     - manual_credit     -> يدوى / manual
   Rendered as a small italic subtitle under the amount with title tooltip.

2. /customer-credits/[customerId] gained icons + labels for source types
   that v3.74.77 introduced but the page didn't know about: overpayment,
   manual_credit, credit_expired. Previously those rows fell through to
   raw text.

3. /payments page now has a CustomerCreditBalanceHint mounted under the
   customer selector. Fetches /api/customer-credits/[customerId] when a
   customer is picked; if balance > 0, shows a green hint with the amount
   and a 'Apply to invoice' link to the customer credit page. Hidden when
   there's no balance or no selection. Self-contained (state inside),
   useEffect cancel guard.

UI-only. TypeScript: 0 errors. All anchors patched via bash heredoc." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.78 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.77.ps1') { Remove-Item -LiteralPath 'push_v3.74.77.ps1' -Force }
}
