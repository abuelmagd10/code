$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.270.ps1") { Remove-Item -LiteralPath "push_v3.74.270.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.271"') {
    Write-Host "+ 3.74.271" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$bill = Get-Content -LiteralPath "app/bills/[id]/page.tsx" -Raw
# Make sure no .single() is left anywhere in the file
$singleCount = ([regex]::Matches($bill, '\.single\(\)')).Count
if ($singleCount -gt 0) {
    Write-Host "X $singleCount .single() calls still in bills/[id]/page.tsx" -ForegroundColor Red; exit 1
}
$maybeCount = ([regex]::Matches($bill, '\.maybeSingle\(\)')).Count
if ($maybeCount -lt 9) {
    Write-Host "X expected at least 9 maybeSingle() calls, found $maybeCount" -ForegroundColor Red; exit 1
}
Write-Host "+ bills/[id] uses maybeSingle everywhere ($maybeCount), no .single() left" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_271.txt"
    $msgLines = @(
        'fix(bills): v3.74.271 - replace the rest of .single() with .maybeSingle()',
        '',
        'v3.74.270 only fixed the primary bill load. The same loadData() then',
        'fired four more .single() lookups (branch, purchase_order, supplier,',
        'product names) and updateLinkedPurchaseOrderStatus() had a fifth.',
        'Any of those throwing because the referenced row was deleted (or',
        'because RLS hid it) would surface as the generic Application Error',
        'screen for the entire bill detail page.',
        '',
        'This release swaps every remaining .single() in app/bills/[id]/page.tsx',
        'to .maybeSingle() so a missing branch/PO/supplier/product simply',
        'leaves the corresponding label blank instead of crashing the page.',
        '',
        'Files',
        '  app/bills/[id]/page.tsx',
        '  lib/version.ts -> 3.74.271'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.271 pushed" -ForegroundColor Green
}
