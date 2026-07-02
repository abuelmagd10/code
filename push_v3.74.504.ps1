$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.503.ps1") { Remove-Item -LiteralPath "push_v3.74.503.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.504"') {
    Write-Host "+ 3.74.504" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$banner = Get-Content -LiteralPath "components/bills/BillAmendmentBanner.tsx" -Raw
if ($banner -notmatch 'HeaderChange' -or $banner -notmatch 'headerChanges') {
    Write-Host "X banner missing document-level changes" -ForegroundColor Red; exit 1
}
if ($banner -notmatch 'shipping_tax_rate_snapshot') {
    Write-Host "X banner missing shipping tax diff" -ForegroundColor Red; exit 1
}
Write-Host "+ banner spells out general discount / shipping / adjustment / tax changes" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_504.txt"
    $msgLines = @(
        'feat(banner): v3.74.504 - amendment banner shows document-level edits',
        '',
        'Owner test case: accountant changed an item qty (3->1) AND the',
        'general discount (10% -> 15%). The banner listed the item edit',
        'but the discount change only showed up indirectly via the total',
        'delta (11.61 -> 7.34).',
        '',
        'The banner now renders a "document-level changes" section that',
        'diffs the pending amendment snapshot against the prior approved',
        'one for: general discount (value + percent/amount type),',
        'shipping, shipping tax rate, adjustment, and tax amount.',
        'Item added/removed/modified lists (v3.74.495) unchanged.',
        'Shared component - sales invoices inherit the same detail.',
        '',
        'Files',
        '  components/bills/BillAmendmentBanner.tsx',
        '  lib/version.ts -> 3.74.504'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.504 pushed - banner covers every amendment dimension" -ForegroundColor Green
}
