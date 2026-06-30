$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.403.ps1") { Remove-Item -LiteralPath "push_v3.74.403.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.404"') {
    Write-Host "+ 3.74.404" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260629000404_v3_74_404_so_discount_approval.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X missing migration 404" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 404 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'O\. الموافقة على الخصم لطلب المبيعات') {
    Write-Host "X CONTRACTS.md missing Section O" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section O" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_404.txt"
    $msgLines = @(
        'feat(approvals): v3.74.404 - Stage C sales-order discount approval',
        '',
        'Mirrors v3.74.401 (PO discount approval) on the sales side.',
        '',
        'DB (applied via Supabase MCP)',
        '  - so_request_discount_approval trigger on sales_orders:',
        '    * Creates discount_approvals row of type "sales_order".',
        '    * Dispatches notifications directly to owner / general_',
        '      manager / admin (closes the same notification gap we',
        '      had on the purchase side until v3.74.401).',
        '  - inv_request_discount_approval_trg now honors any non-empty',
        '    app.skip_discount_approval token (was: only "booking").',
        '    Future SO -> Invoice auto-creation can set "so" to skip.',
        '  - Section O added to assert_baseline / CONTRACTS.md.',
        '',
        'Outstanding (not in this commit)',
        '  Stage D will add a sales-order approval RPC + invoice',
        '  auto-creation path with the bypass set so the discount',
        '  approval lives only on the SO surface (mirrors PO->Bill',
        '  carryover from v3.74.398).',
        '',
        'Files',
        '  supabase/migrations/20260629000404_v3_74_404_so_discount_approval.sql',
        '  CONTRACTS.md (Section O added)',
        '  lib/version.ts -> 3.74.404'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.404 pushed - SO discount approval + notifications" -ForegroundColor Green
}
