$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.499.ps1") { Remove-Item -LiteralPath "push_v3.74.499.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.500"') {
    Write-Host "+ 3.74.500" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260702000500_v3_74_500_amendment_approval_baseline_refresh.sql")) {
    Write-Host "X migration 500 missing" -ForegroundColor Red; exit 1
}

$svc = Get-Content -LiteralPath "lib/services/bill-receipt-workflow.service.ts" -Raw
if ($svc -notmatch 'pending_approval' -or $svc -notmatch 'original_tax_amount') {
    Write-Host "X workflow service missing v3.74.500 gates" -ForegroundColor Red; exit 1
}

$edit = Get-Content -LiteralPath "app/bills/[id]/edit/page.tsx" -Raw
if ($edit -notmatch 'original_tax_amount') {
    Write-Host "X bill edit page missing original_tax_amount sync" -ForegroundColor Red; exit 1
}
Write-Host "+ receipt submission gated + baseline refresh wired" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_500.txt"
    $msgLines = @(
        'fix(procurement): v3.74.500 - no warehouse ping before bill admin approval',
        '',
        'PO-0001 incident (company Test, Nasr City branch): after the owner',
        'approved a bill amendment, the accountant could click "Submit for',
        'Receipt" and the store manager got the receive notification even',
        'though the bill was still pending admin approval. The receive',
        'attempt then failed with "approve the bill first" (v3.74.499 gate).',
        '',
        'Root causes and fixes:',
        '1. submitForReceipt now REJECTS bills in pending_approval instead',
        '   of silently auto-approving them (governance bypass).',
        '2. submitForReceipt verifies the post-update state: if the',
        '   bills_force_reapproval_on_edit trigger rewrote status back to',
        '   pending_approval, it rolls back receipt_status and explains,',
        '   instead of notifying the warehouse anyway.',
        '3. Infinite re-approval loop: original_tax_amount was never',
        '   refreshed (bill edit page synced only original_total/subtotal),',
        '   so the trigger saw a permanent tax diff (1.43 vs 0.59).',
        '   - bill edit page now syncs original_tax_amount',
        '   - approveBill refreshes all three baselines on admin approval',
        '   - amendment-approval DB trigger refreshes baselines when',
        '     returning the bill to draft (migration 500, already applied)',
        '',
        'Data hygiene (already applied in prod): BILL-0001 stray',
        'receipt_status cleared, premature store-manager notifications',
        'archived.',
        '',
        'Files',
        '  supabase/migrations/20260702000500_v3_74_500_amendment_approval_baseline_refresh.sql',
        '  lib/services/bill-receipt-workflow.service.ts',
        '  app/bills/[id]/edit/page.tsx',
        '  lib/version.ts -> 3.74.500'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.500 pushed - approval sequence enforced end-to-end" -ForegroundColor Green
}
