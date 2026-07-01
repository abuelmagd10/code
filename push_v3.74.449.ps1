$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.448.ps1") { Remove-Item -LiteralPath "push_v3.74.448.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.449"') {
    Write-Host "+ 3.74.449" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AV\. ?مؤشر رفض') {
    Write-Host "X CONTRACTS.md missing Section AV" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AV" -ForegroundColor Green

$api = Get-Content -LiteralPath "app/api/v2/purchase-orders/route.ts" -Raw
if ($api -notmatch 'discount_approvals' -or $api -notmatch 'discount_approval_status') {
    Write-Host "X API not enriched with discount_approval_status" -ForegroundColor Red; exit 1
}
Write-Host "+ API enriches discount_approval_status" -ForegroundColor Green

$list = Get-Content -LiteralPath "app/purchase-orders/page.tsx" -Raw
if ($list -notmatch 'الخصم مرفوض') {
    Write-Host "X list missing rejected-discount badge" -ForegroundColor Red; exit 1
}
Write-Host "+ list renders discount badges" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_449.txt"
    $msgLines = @(
        'feat(purchase-orders): v3.74.449 - surface discount rejection in list view',
        '',
        'Owner asked for a visible indicator on the /purchase-orders',
        'list when a discount is rejected. Without it, staff had to open',
        'every pending_approval PO to find the one that needed re-work.',
        '',
        'API /api/v2/purchase-orders now batches a discount_approvals',
        'lookup for the visible page and stamps',
        '   discount_approval_status: pending | approved | rejected |',
        '                             cancelled | null',
        'on every row.',
        '',
        'List column status renders one small badge under the status:',
        '   rejected -> red  "⚠ الخصم مرفوض"',
        '   pending  -> yellow "الخصم قيد الاعتماد"',
        '   else     -> nothing extra',
        'Both the linked-bill and no-bill paths render the badge.',
        '',
        'Sales orders have no v2 API; deferred.',
        '',
        'Files',
        '   app/api/v2/purchase-orders/route.ts',
        '   app/purchase-orders/page.tsx',
        '   types/database.ts',
        '   CONTRACTS.md (Section AV added)',
        '   lib/version.ts -> 3.74.449'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.449 pushed - discount status visible in PO list" -ForegroundColor Green
}
