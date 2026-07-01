$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.480.ps1") { Remove-Item -LiteralPath "push_v3.74.480.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.481"') {
    Write-Host "+ 3.74.481" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000481_v3_74_481_history_complete.sql")) {
    Write-Host "X migration 481 missing" -ForegroundColor Red; exit 1
}

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
foreach ($k in @('"dispatch"','"goods_receipt"','"write_off"','"inventory_transfer"','"misc"')) {
    if ($page -notmatch [regex]::Escape($k)) {
        Write-Host "X approvals page missing history category $k" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ history includes all remaining categories" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_481.txt"
    $msgLines = @(
        'feat(inbox): v3.74.481 - history covers every unified inbox category',
        '',
        'Added history loaders + filter buttons for:',
        '   dispatch, goods_receipt, write_off, inventory_transfer,',
        '   misc (purchase_requests + bank_voucher_requests + expenses',
        '         + customer_debit_notes + permission_transfers).',
        '',
        'The unified /approvals surface (v3.74.472 -> v3.74.481) is',
        'complete: every pending workflow appears as a tab; every',
        'decided workflow appears in history with a matching filter.',
        '',
        'Files',
        '   supabase/migrations/20260701000481_v3_74_481_history_complete.sql',
        '   app/approvals/page.tsx',
        '   CONTRACTS.md (Section CB added)',
        '   lib/version.ts -> 3.74.481'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.481 pushed - history is fully unified" -ForegroundColor Green
}
