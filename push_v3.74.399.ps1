$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.398.ps1") { Remove-Item -LiteralPath "push_v3.74.398.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.399"') {
    Write-Host "+ 3.74.399" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$wired = @(
    'app/bills/[id]/edit/page.tsx',
    'app/invoices/new/page.tsx',
    'app/invoices/[id]/edit/page.tsx',
    'app/sales-orders/new/page.tsx',
    'app/sales-orders/[id]/edit/page.tsx',
    'app/vendor-credits/new/page.tsx'
)
foreach ($f in $wired) {
    $content = Get-Content -LiteralPath $f -Raw
    if ($content -notmatch 'v3\.74\.399') {
        Write-Host "X $f missing v3.74.399 annotation" -ForegroundColor Red; exit 1
    }
    if ($content -notmatch 'totals\.discountAmount > 0') {
        Write-Host "X $f does not render discount line" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ $($wired.Count) forms render discount line" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'L\. سطر الخصم') {
    Write-Host "X CONTRACTS.md missing Section L" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md updated with Section L" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_399.txt"
    $msgLines = @(
        'fix(ui): v3.74.399 - surface discount line in bill/invoice summary',
        '',
        'Owner reviewed BILL-0001 after v3.74.398 and noticed the summary',
        'card showed Subtotal 10.00, Tax 1.34, Shipping 1.00, Total 10.94.',
        'The four visible numbers do not add to the total (10+1.34+1=12.34',
        'not 10.94). The missing 1.40 is the header discount, which the',
        'summary was hiding entirely. Math was right; layout wasn''t.',
        '',
        'Fix: render a Discount row between Subtotal and Tax in every',
        'form that supports a header discount.',
        '',
        '  subtotalBeforeDiscount - discount + tax + shipping + adjustment = total',
        '',
        'Forms updated',
        '  app/bills/[id]/edit/page.tsx',
        '  app/invoices/new/page.tsx',
        '  app/invoices/[id]/edit/page.tsx',
        '  app/sales-orders/new/page.tsx',
        '  app/sales-orders/[id]/edit/page.tsx',
        '  app/vendor-credits/new/page.tsx',
        '  (purchase-orders new + edit already had the line; left as-is)',
        '',
        'The row is conditional on discountAmount > 0 so it stays out of',
        'the way when no discount applies. Color tinted red so it reads',
        'as a deduction without needing a label re-read.',
        '',
        'CONTRACTS.md Section L pins the convention for future forms.',
        '',
        'Files',
        '  6 form pages',
        '  CONTRACTS.md (Section L)',
        '  lib/version.ts -> 3.74.399'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.399 pushed - discount line visible in all summaries" -ForegroundColor Green
}
