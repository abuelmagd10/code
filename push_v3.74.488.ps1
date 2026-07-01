$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.487.ps1") { Remove-Item -LiteralPath "push_v3.74.487.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.488"') {
    Write-Host "+ 3.74.488" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000488_v3_74_488_product_receive_pending.sql")) {
    Write-Host "X migration 488 missing" -ForegroundColor Red; exit 1
}

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'PendingProductReceive' -or $page -notmatch 'product-receive-approvals') {
    Write-Host "X approvals page missing product receive tab" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page includes product receive pending tab" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_488.txt"
    $msgLines = @(
        'feat(inbox): v3.74.488 - manufacturing product receive pending gets its own tab',
        '',
        'Evidence-based audit of /inventory/goods-receipt showed a real',
        'gap: the dedicated page had two flows (bill receipt + mfg product',
        'receive) and only the first had been migrated. Manufacturing',
        'pending approvals lived on the goods-receipt page toggle only.',
        '',
        'Loader reads manufacturing_product_receive_approvals status=',
        'pending. Card renders order + product + proposed_quantity +',
        'branch/warehouse.',
        '',
        'Actions call POST /api/manufacturing/product-receive-approvals/',
        '[id]/{approve,reject} - unchanged endpoints, unchanged governance.',
        '',
        'Tab key pr added to the role matrix so store/warehouse manager,',
        'manufacturing_officer, and branch manager all see it. History',
        'category product_receive remaps to the new tab.',
        '',
        'Files',
        '  supabase/migrations/20260701000488_v3_74_488_product_receive_pending.sql',
        '  app/approvals/page.tsx',
        '  CONTRACTS.md (Section CI added)',
        '  lib/version.ts -> 3.74.488'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.488 pushed - manufacturing product receive pending live" -ForegroundColor Green
}
