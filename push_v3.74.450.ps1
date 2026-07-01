$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.449.ps1") { Remove-Item -LiteralPath "push_v3.74.449.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.450"') {
    Write-Host "+ 3.74.450" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AW\. ?مؤشر رفض') {
    Write-Host "X CONTRACTS.md missing Section AW" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AW" -ForegroundColor Green

$api = Get-Content -LiteralPath "app/api/sales-orders/route.ts" -Raw
if ($api -notmatch 'discount_approvals' -or $api -notmatch 'discount_approval_status') {
    Write-Host "X sales-orders API not enriched" -ForegroundColor Red; exit 1
}
Write-Host "+ /api/sales-orders enriches discount_approval_status" -ForegroundColor Green

$list = Get-Content -LiteralPath "app/sales-orders/page.tsx" -Raw
if ($list -notmatch 'الخصم مرفوض') {
    Write-Host "X /sales-orders missing rejected-discount badge" -ForegroundColor Red; exit 1
}
Write-Host "+ /sales-orders renders discount badges" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_450.txt"
    $msgLines = @(
        'feat(sales-orders): v3.74.450 - discount rejection badge on list (mirror of v3.74.449)',
        '',
        'Owner asked: do not forget sales orders. Same treatment as',
        'v3.74.449 on the purchase side, applied to /sales-orders.',
        '',
        '/api/sales-orders now batches a discount_approvals lookup and',
        'stamps discount_approval_status on every row.',
        '',
        'The list column renders a small badge under the status:',
        '   rejected -> red  "⚠ الخصم مرفوض"',
        '   pending  -> yellow "الخصم قيد الاعتماد"',
        'Both linked-invoice and no-invoice paths render the badge.',
        '',
        'Files',
        '   app/api/sales-orders/route.ts',
        '   app/sales-orders/page.tsx',
        '   CONTRACTS.md (Section AW added)',
        '   lib/version.ts -> 3.74.450'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.450 pushed - discount status visible in SO list" -ForegroundColor Green
}
