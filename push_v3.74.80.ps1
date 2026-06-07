# v3.74.80 - Stop double-counting overpayment in /customers
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.80"') { Write-Host "+ APP_VERSION = 3.74.80" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.80" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.80]')) { Write-Host "+ CHANGELOG 3.74.80" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.80" -ForegroundColor Red; exit 1 }

$cust = Get-Content -LiteralPath "app/customers/page.tsx" -Raw
$lineCount = ($cust -split "`n").Count
if ($lineCount -ge 1495) { Write-Host "+ customers/page.tsx intact ($lineCount lines)" -ForegroundColor Green } else { Write-Host "X customers/page.tsx truncated ($lineCount lines)" -ForegroundColor Red; exit 1 }
if ($cust.TrimEnd().EndsWith("}")) { Write-Host "+ ends with }" -ForegroundColor Green } else { exit 1 }

if ($cust -match 'v3\.74\.80' -and $cust -match 'available: Math\.max\(adv - ap, 0\) \+ credits,') {
    Write-Host "+ v3.74.80 marker present + double-count removed" -ForegroundColor Green
} else { Write-Host "X v3.74.80 markers missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String "customers/page\.tsx").Count
if ($err -eq 0) { Write-Host "+ 0 errors in customers/page.tsx" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; $tsc | Select-String "customers/page\.tsx" | Select-Object -First 5; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(credit): v3.74.80 - drop double-counted overpayment in /customers

After v3.74.79 added the invoice-overpayment DB trigger, the /customers
page started showing ahmed abuelmagd at 1.36 EGP instead of 0.68 EGP -
exactly double. The page was both reading customer_credits AND computing
overpayment locally from paid - total. v3.74.79 now writes that same
overpayment into customer_credits via trigger, so the local map became
redundant - and additive.

محمد بسيونى wasn't affected because INV-00004 has returned_amount > 0, so
the local formula returned 0 for him. The bug only shows on overpayments
without returns.

Fix: drop invoiceOverpayment from the available/credits computation in
app/customers/page.tsx (around line 564). The map construction stays
for now - one extra SELECT during load, removing it requires a wider
rewrite.

Verified post-fix:
- ahmed abuelmagd: 0.68 (was 1.36)
- محمد بسيونى: 10.00 (unchanged, was already correct)
- Both customers visible on the page." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.80 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.79.ps1') { Remove-Item -LiteralPath 'push_v3.74.79.ps1' -Force }
}
