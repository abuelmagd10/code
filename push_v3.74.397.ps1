$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.396.ps1") { Remove-Item -LiteralPath "push_v3.74.396.ps1" -Force }
if (Test-Path "push_v3.74.395.ps1") { Remove-Item -LiteralPath "push_v3.74.395.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.397"') {
    Write-Host "+ 3.74.397" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# v3.74.396 changes (visible math fix)
$util = Get-Content -LiteralPath "lib/document-totals.ts" -Raw
if ($util -notmatch 'subtotalBeforeDiscount') {
    Write-Host "X document-totals missing subtotalBeforeDiscount" -ForegroundColor Red; exit 1
}
Write-Host "+ utility carries subtotal + subtotalBeforeDiscount" -ForegroundColor Green

$wired = @(
    'app/purchase-orders/new/page.tsx',
    'app/purchase-orders/[id]/edit/page.tsx',
    'app/bills/[id]/edit/page.tsx',
    'app/invoices/new/page.tsx',
    'app/invoices/[id]/edit/page.tsx',
    'app/sales-orders/new/page.tsx',
    'app/sales-orders/[id]/edit/page.tsx',
    'app/vendor-credits/new/page.tsx'
)
foreach ($f in $wired) {
    $content = Get-Content -LiteralPath $f -Raw
    if ($content -notmatch 'subtotalBeforeDiscount') {
        Write-Host "X $f does not display subtotalBeforeDiscount" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ $($wired.Count) forms display subtotalBeforeDiscount" -ForegroundColor Green

# v3.74.397 changes (notification creator name)
$svc = Get-Content -LiteralPath "lib/services/purchase-order-notification.service.ts" -Raw
foreach ($n in @('createdByName', 'creatorClauseAr', 'creatorClauseEn', 'المُنشِئ', 'created by ')) {
    if ($svc -notmatch [regex]::Escape($n)) {
        Write-Host "X notification service missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ notification service includes creator clause" -ForegroundColor Green

$apiR = Get-Content -LiteralPath "app/api/purchase-orders/[id]/notifications/route.ts" -Raw
foreach ($n in @('createdByName', 'employees', 'full_name', 'creatorUserId')) {
    if ($apiR -notmatch [regex]::Escape($n)) {
        Write-Host "X notifications route missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ notifications API resolves creator name" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'Section J' -and $contracts -notmatch 'J\. اسم المنشئ') {
    Write-Host "X CONTRACTS.md missing Section J entry" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md updated with Section J" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_397.txt"
    $msgLines = @(
        'feat(notifications + totals): v3.74.397 - creator name + UI math',
        '',
        'Bundles two small UI improvements that surfaced during the',
        'purchase-order test flow.',
        '',
        '1) Approver notification carries the creator''s name',
        '',
        'Owner observed: the notification reads',
        '  "أمر شراء PO-0001 للمورد ... بقيمة ... يحتاج إلى موافقتك"',
        'but never names the person who submitted it. With multiple',
        'purchasing officers the approver has to open the PO to find',
        'out who is asking. Now the message ends with',
        '  "...يحتاج إلى موافقتك (المُنشِئ: <full_name>)"',
        '',
        'Resolution order',
        '  1. employees.full_name where user_id = creator (canonical).',
        '  2. company_members.email (fallback).',
        '  3. omit the clause entirely (graceful degrade).',
        '',
        'Backwards compatible: createdByName is optional on',
        'PurchaseOrderApprovalRequestNotificationParams. Other callers',
        'of notifyApprovalRequested do not need to change.',
        '',
        'Follow-up tracked in CONTRACTS.md Section J: the same pattern',
        'should be applied to BankVoucher, PaymentApproval, Booking,',
        'PurchaseReturn, WriteOff and InventoryTransfer notification',
        'services. Deferred until the owner asks for it on those',
        'specific surfaces.',
        '',
        '2) UI totals breakdown adds up visually',
        '',
        'v3.74.395 exposed `subtotal` as POST-discount which matches',
        'the DB convention (INV-0011 stored 1500 = 1600 - 100) but',
        'made the totals card read "9 - 1 + 1.26 != 10.26" — visually',
        'broken. v3.74.397 keeps `subtotal` POST-discount for DB writes',
        'and introduces `subtotalBeforeDiscount` (PRE-discount) for UI',
        'display. The 8 wired forms now render subtotalBeforeDiscount',
        'so the user reads',
        '  10 - 1 + 1.26 = 10.26 ✓',
        '',
        'Self-test scenario3 in lib/document-totals.ts pins the',
        'contract: subtotalBeforeDiscount - discount + tax === total.',
        '',
        'Note: the owner originally suspected this was wrong but later',
        'confirmed the math was correct — they had toggled "السعر',
        'يشمل الضريبة" during testing. The fix is still useful: even',
        'with correct math the visual breakdown was confusing.',
        '',
        'Files',
        '  lib/services/purchase-order-notification.service.ts (createdByName)',
        '  app/api/purchase-orders/[id]/notifications/route.ts  (resolve name)',
        '  lib/document-totals.ts                                (subtotal split)',
        '  + 8 form pages display subtotalBeforeDiscount',
        '  CONTRACTS.md                                          (Sections I+J)',
        '  lib/version.ts                                        -> 3.74.397'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.397 pushed - creator name in notifications + UI math" -ForegroundColor Green
}
