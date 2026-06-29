$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.395.ps1") { Remove-Item -LiteralPath "push_v3.74.395.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.396"') {
    Write-Host "+ 3.74.396" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$util = Get-Content -LiteralPath "lib/document-totals.ts" -Raw
foreach ($n in @(
    'subtotalBeforeDiscount',
    'POST-header-discount subtotal',
    'scenario3 UI breakdown math closes'
)) {
    if ($util -notmatch [regex]::Escape($n)) {
        Write-Host "X document-totals.ts missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ utility carries both subtotal (DB) and subtotalBeforeDiscount (UI)" -ForegroundColor Green

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
Write-Host "+ $($wired.Count) forms display subtotalBeforeDiscount in UI" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_396.txt"
    $msgLines = @(
        'fix(totals): v3.74.396 - UI breakdown adds up visually',
        '',
        'Owner reported on v3.74.395: after switching position to "قبل',
        'الضريبة" the totals card showed:',
        '  Subtotal: 9.00, Discount: -1.00, Tax: 1.26, Total: 10.26',
        'The math the user reads (9 - 1 + 1.26) = 9.26, not 10.26.',
        '',
        'Root cause: v3.74.395 exposed `subtotal` as POST-discount (so',
        'the breakdown line was already discount-net), but the form',
        'still rendered the discount line below it, making it look',
        'like a second deduction. Numbers were correct; the breakdown',
        'narrative wasn''t.',
        '',
        'Resolution: keep two distinct fields on the utility output.',
        '',
        'lib/document-totals.ts',
        '  subtotal               POST-discount  - persist to DB (matches',
        '                                          historical convention,',
        '                                          INV-0011 stored 1500 =',
        '                                          1600 lines - 100 discount)',
        '  subtotalBeforeDiscount PRE-discount   - render in UI so that',
        '                                          subtotal - discount + tax',
        '                                          = total adds up on screen',
        '',
        'New self-test scenario3 in the file pins the contract:',
        '  subtotalBeforeDiscount - discount + tax === total',
        '',
        'Forms updated to display subtotalBeforeDiscount',
        '  app/purchase-orders/new/page.tsx',
        '  app/purchase-orders/[id]/edit/page.tsx',
        '  app/bills/[id]/edit/page.tsx',
        '  app/invoices/new/page.tsx',
        '  app/invoices/[id]/edit/page.tsx',
        '  app/sales-orders/new/page.tsx',
        '  app/sales-orders/[id]/edit/page.tsx',
        '  app/vendor-credits/new/page.tsx',
        'All DB writes still pass totals.subtotal so old + new rows',
        'remain consistent.',
        '',
        'Owner scenario after this commit',
        '  Line: VitaSlims x10 @ 1, tax 14% exclusive, discount 10% before_tax',
        '  Card shows: Subtotal 10.00, Discount -1.00, Tax 1.26, Total 10.26.',
        '  Visible math: 10 - 1 + 1.26 = 10.26 ✓',
        '',
        'Files',
        '  lib/document-totals.ts          (subtotal/subtotalBeforeDiscount split)',
        '  + 7 form pages display tweaks',
        '  CONTRACTS.md                    (Section I v3.74.396 addendum)',
        '  lib/version.ts                  -> 3.74.396'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.396 pushed - UI breakdown coherent" -ForegroundColor Green
    Write-Host "  Re-run the test: subtotal should now show 10.00, discount -1.00, tax 1.26, total 10.26 — and 10 - 1 + 1.26 = 10.26 is visually obvious." -ForegroundColor Cyan
}
