# v3.74.8 - payment method dropdown on invoice form
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.8"') { Write-Host "+ APP_VERSION = 3.74.8" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.8" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.8\]') { Write-Host "+ CHANGELOG entry for 3.74.8 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.74.8 entry" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw

# Old free-text Input gone, new <select> wired
if ($pg -notmatch 'Input value=\{paymentMethod\}') {
    Write-Host "+ free-text Input for paymentMethod removed" -ForegroundColor Green
} else { Write-Host "X free-text paymentMethod Input still present" -ForegroundColor Red; exit 1 }

if ($pg -match 'value="bank_transfer"' -and $pg -match 'value="cheque"' -and $pg -match 'value="card"' -and $pg -match 'value="cash"') {
    Write-Host "+ all four payment method options present" -ForegroundColor Green
} else { Write-Host "X payment method options incomplete" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        "app/invoices/[id]/page.tsx" `
        CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(invoices): v3.74.8 - payment method dropdown on record-payment form

The 'طريقة الدفع' field in the record-payment form on an invoice
was a free-text Input with placeholder 'cash'. The display side
already has a finite vocabulary (cash / bank_transfer / card /
cheque) and renders a colored badge with an icon for each.
Anything else fell through as raw text.

So typos like 'caash' or 'Cash' got stored as-is and rendered
as unrecognized text on the payment history.

Fix:
  Replaced the Input at line 3361 with a native <select>
  matching the four options the display logic already supports:
    cash         -> نقدى
    bank_transfer -> تحويل بنكى
    card         -> بطاقة ائتمان
    cheque       -> شيك

  Default is cash. Same styling as the existing Account dropdown
  two rows below for visual consistency.

Bills page checked - uses a different payment dialog pattern;
follow-up if same fix wanted there.

Verify:
  - Form shows dropdown not text box
  - Selecting 'تحويل بنكى' saves as 'bank_transfer' and shows
    the blue badge with card icon on payment history
  - No more typos slipping through

Files:
  Modified: app/invoices/[id]/page.tsx
  Modified: lib/version.ts (3.74.7 -> 3.74.8)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.8 pushed" -ForegroundColor Green
}
