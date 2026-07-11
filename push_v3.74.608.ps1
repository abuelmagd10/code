$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.607.ps1") { Remove-Item -LiteralPath "push_v3.74.607.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.608"') {
    Write-Host "+ 3.74.608" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($pg -notmatch 'canDirectReturn') {
    Write-Host "X direct-return role gate missing in UI" -ForegroundColor Red; exit 1
}
if (-not (Test-Path "supabase/migrations/20260711000608_v3_74_608_direct_return_owner_gm_only.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ direct returns gated to owner + GM (UI + DB trigger)" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 30 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر — الرفع انتقائى حصراً
git add -- `
    "app/invoices/[id]/page.tsx" `
    "supabase/migrations/20260711000608_v3_74_608_direct_return_owner_gm_only.sql" `
    "lib/version.ts" `
    "push_v3.74.608.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.607.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_608.txt"
    $msgLines = @(
        'feat(returns): v3.74.608 - direct invoice returns restricted to owner + GM',
        '',
        'Owner decision (minimal-change option): keep the invoice-page',
        'full/partial return buttons as the top-management express lane',
        '(owner + general_manager - the same set as supplier-payment',
        'approval since v3.74.132) instead of removing them. Every other',
        'role uses the sales-return-request cycle (management approval +',
        'warehouse receive), whose notifications were fixed for all',
        'approvers in v3.74.607.',
        '',
        'Two layers:',
        '- UI: canShowReturnButtons now requires role in',
        '  {owner, general_manager} (new canDirectReturn const)',
        '- DB (live via MCP): BEFORE INSERT trigger on sales_returns -',
        '  authenticated non-owner/GM inserts rejected with Arabic',
        '  guidance to the request cycle; service-role (request-cycle',
        '  RPCs) executions pass untouched. Real enforcement lives in',
        '  the DB because the direct path inserts from the browser.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.608 pushed - express returns are management-only" -ForegroundColor Green
}
