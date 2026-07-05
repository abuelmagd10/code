$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.529"') {
    Write-Host "+ 3.74.529" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ap = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw

if ($ap -notmatch 'total_amount, paid_amount, returned_amount, currency_code, purchase_order_id') {
    Write-Host "X bills SELECT missing returned_amount" -ForegroundColor Red; exit 1
}
if ($ap -notmatch 'billTotal - billPaid - Number\(primaryBill\?\.returned_amount \|\| 0\)') {
    Write-Host "X outstanding calc not subtracting returned_amount" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals card outstanding subtracts returns" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_529.txt"
    $msgLines = @(
        'fix(approvals): v3.74.529 - outstanding in card also subtracts returned_amount',
        '',
        '/bills/[id] now correctly shows 6.31 for BILL-0001 (v3.74.527),',
        'but /approvals payment card still shows 7.34 -- the loader was',
        'computing bill_outstanding = total - paid, ignoring returns.',
        '',
        'Fix: add returned_amount to the bills SELECT in the supplier',
        'payment loader, and subtract it in the mapper. Now:',
        '  bill_outstanding = total - paid - returned = 6.31 EGP',
        'matching the Three-Way Match panel on the bill view page.',
        '',
        'Files',
        '  app/approvals/page.tsx (loader select + mapper)',
        '  supabase/migrations/20260703000529_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.529'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.529 pushed - card and bill view finally agree" -ForegroundColor Green
}
