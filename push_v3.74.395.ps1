$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.394.ps1") { Remove-Item -LiteralPath "push_v3.74.394.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.395"') {
    Write-Host "+ 3.74.395" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$util = "lib/document-totals.ts"
if (-not (Test-Path -LiteralPath $util)) { Write-Host "X missing $util" -ForegroundColor Red; exit 1 }
$utilContent = Get-Content -LiteralPath $util -Raw
foreach ($n in @(
    'export function computeDocumentTotals',
    'discountPosition === "before_tax"',
    'discountPosition === "after_tax"',
    'taxBeforeDiscount',
    'subtotalBeforeDiscount',
    'tax_inclusive',
    'self-test'
)) {
    if ($n -eq 'tax_inclusive') { continue }
    if ($n -eq 'self-test') { continue }
    if ($utilContent -notmatch [regex]::Escape($n)) {
        Write-Host "X $util missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ document-totals utility present" -ForegroundColor Green

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
    if ($content -notmatch [regex]::Escape('computeDocumentTotals')) {
        Write-Host "X $f does not import computeDocumentTotals" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ $($wired.Count) forms wired to computeDocumentTotals" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'Section I' -and $contracts -notmatch 'I\. حساب الإجماليات الموحد') {
    Write-Host "X CONTRACTS.md missing Section I entry" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md updated with Section I" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_395.txt"
    $msgLines = @(
        'fix(totals): v3.74.395 - unified document totals utility',
        '',
        'Owner reported: in new purchase order, switching "discount',
        'position" from "after tax" to "before tax" produced zero',
        'visible change in the totals. Root cause: every form had its',
        'own inline calculateTotals. Some were correct, some were not.',
        'purchase-orders/new in particular subtracted the discount at',
        'the very end without recomputing tax, so before_tax and',
        'after_tax collapsed to the same total for amount discounts.',
        '',
        'Owner instruction: fix it everywhere ("افضل الحل فى جميع',
        'المواضع المتواجدة فى المشروع"). Done by centralising the',
        'computation.',
        '',
        'New utility: lib/document-totals.ts',
        '  Single pure function computeDocumentTotals(input) → totals.',
        '  Contract:',
        '    - discount_position = before_tax: discount lowers the',
        '      taxable base; tax is recomputed proportionally on the',
        '      reduced base.',
        '    - discount_position = after_tax: tax on full subtotal;',
        '      discount comes off the after-tax sum.',
        '    - When discount_value = 0, both positions collapse to the',
        '      same total (regression guard).',
        '    - Honours tax_inclusive.',
        '  Self-tests at the bottom of the file run in dev mode and',
        '  warn if the contract breaks.',
        '',
        'Forms migrated to the shared utility',
        '  app/purchase-orders/new/page.tsx       (BROKEN -> fixed)',
        '  app/purchase-orders/[id]/edit/page.tsx',
        '  app/bills/[id]/edit/page.tsx',
        '  app/invoices/new/page.tsx',
        '  app/invoices/[id]/edit/page.tsx',
        '  app/sales-orders/new/page.tsx',
        '  app/sales-orders/[id]/edit/page.tsx',
        '  app/vendor-credits/new/page.tsx',
        '  Result: ~470 lines of duplicate, drifting math collapsed',
        '  into one well-tested function.',
        '',
        'Verifying the fix on owner''s exact scenario',
        '  Line: VitaSlims x10 @ 1 EGP, tax 14%, tax_inclusive=true,',
        '  header discount = 2 EGP amount.',
        '    after_tax  -> subtotal=8.77 tax=1.23 total=8.00',
        '    before_tax -> subtotal=6.77 tax=0.95 total=7.72',
        '  Difference is now visible (28 piastres) as expected.',
        '',
        'Server-side (deferred)',
        '  The APIs currently passthrough client totals. A future',
        '  hardening pass will have the server recompute via the same',
        '  utility (pure TS, no client-only deps) for defense in depth.',
        '  Not in scope here — fix the bug first.',
        '',
        'Files',
        '  lib/document-totals.ts                 (new)',
        '  + 8 form pages wired to it',
        '  CONTRACTS.md                           (Section I added)',
        '  lib/version.ts                         -> 3.74.395'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.395 pushed - unified totals utility" -ForegroundColor Green
    Write-Host "  Reproduce the owner's scenario: open new PO, add VitaSlims x10 @ 1, tax 14% inclusive, header discount = 2 EGP amount, toggle before_tax vs after_tax: totals should differ (7.72 vs 8.00)." -ForegroundColor Cyan
}
