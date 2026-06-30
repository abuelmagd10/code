$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.421.ps1") { Remove-Item -LiteralPath "push_v3.74.421.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.422"') {
    Write-Host "+ 3.74.422" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'V\. ?صفحة /approvals تتعامل مع purchase_order') {
    Write-Host "X CONTRACTS.md missing Section V" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section V" -ForegroundColor Green

$approvalsPage = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
foreach ($needle in @('"purchase_order"', '"sales_order"',
                       '/purchase-orders/\$\{item\.document_id\}',
                       '/sales-orders/\$\{item\.document_id\}')) {
    if ($approvalsPage -notmatch $needle) {
        Write-Host "X approvals page missing '$needle'" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ approvals page handles purchase_order + sales_order" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_422.txt"
    $msgLines = @(
        'fix(approvals): v3.74.422 - approvals page handles PO and SO doc types',
        '',
        'The /approvals page renderer typed document_type as',
        '  "sales_invoice" | "purchase_invoice" | "booking"',
        'and fell through to "Booking" + /bookings/<id> for anything',
        'else. purchase_order rows (added by v3.74.401 triggers and the',
        'v3.74.417 enum) showed up as Booking with a broken link.',
        '',
        'Owner spotted it during v3.74.421 testing: PO-0001 was listed',
        'with the booking label and the view button opened /bookings/.',
        '',
        'Fix: extend the union with purchase_order + sales_order and',
        'replace the ternary chains with switches that have an explicit',
        'default ("Document" / href="#") so a future doc type cannot',
        'silently fall through to Booking again.',
        '',
        'Files',
        '   app/approvals/page.tsx',
        '   CONTRACTS.md (Section V added)',
        '   lib/version.ts -> 3.74.422'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.422 pushed - approvals page UI fixed" -ForegroundColor Green
}
