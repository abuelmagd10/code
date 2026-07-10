$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.599.ps1") { Remove-Item -LiteralPath "push_v3.74.599.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.600"') {
    Write-Host "+ 3.74.600" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- markers ---
$svc = Get-Content -LiteralPath "lib/services/sales-invoice-update-command.service.ts" -Raw
if ($svc -notmatch "assertNotBookingLinked") {
    Write-Host "X invoice-update booking guard missing" -ForegroundColor Red; exit 1
}
$edit = Get-Content -LiteralPath "app/bookings/[id]/edit/page.tsx" -Raw
if ($edit -notmatch "discountEditable") {
    Write-Host "X booking edit discount window missing" -ForegroundColor Red; exit 1
}
$invEdit = Get-Content -LiteralPath "app/invoices/[id]/edit/page.tsx" -Raw
if ($invEdit -notmatch "v3\.74\.600" -and $invEdit -notmatch "أمر حجز") {
    Write-Host "X invoice edit page booking notice missing" -ForegroundColor Red; exit 1
}
Write-Host "+ booking discount + invoice-edit lock markers present" -ForegroundColor Green

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
    "components/bookings/BookingForm.tsx" `
    "app/bookings/[id]/edit/page.tsx" `
    "app/api/bookings/[id]/route.ts" `
    "lib/services/sales-invoice-update-command.service.ts" `
    "lib/services/sales-invoice-edit-command.service.ts" `
    "app/invoices/[id]/edit/page.tsx" `
    "app/invoices/[id]/page.tsx" `
    "lib/version.ts" `
    "push_v3.74.600.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.599.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_600.txt"
    $msgLines = @(
        'feat(bookings): v3.74.600 - booking discount UI + booking-invoice edit lock',
        '',
        'Owner governance:',
        '1) Booking orders get a discount input (amount-only) on create +',
        '   edit, wired to the EXISTING approval machinery (the',
        '   bkg_request_discount_approval trigger + banner + activation',
        '   gate from v3.74.374 were already live - only the input was',
        '   missing). Edit window mirrors the trigger exactly: draft or',
        '   confirmed, before an invoice exists; confirmed bookings accept',
        '   a discount-only change (server-enforced); range 0 <= d < total',
        '   checked client+server; updated_by stamped so the approval is',
        '   attributed to the requester.',
        '2) Booking-generated invoices are NOT directly editable by',
        '   anyone (the ORDER is the source of truth until the accountant',
        '   acts): guard in SalesInvoiceUpdateCommandService (live path)',
        '   + the dead-code edit service for depth; the invoice edit page',
        '   renders a blocking notice linking to the booking; the detail',
        '   page hides Edit and shows a "Booking-order invoice" badge.',
        '   Content changes flow from the booking (addons window +',
        '   discount) and auto-resync to the invoice.',
        '',
        'Posting, payments, returns, and resync untouched.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.600 pushed - booking order is the single source of edits" -ForegroundColor Green
}
