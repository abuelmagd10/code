$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.463.ps1") { Remove-Item -LiteralPath "push_v3.74.463.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.464"') {
    Write-Host "+ 3.74.464" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000464_v3_74_464_unified_approval_gate.sql")) {
    Write-Host "X migration 464 missing" -ForegroundColor Red; exit 1
}
Write-Host "+ migration 464 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BK\. ?توحيد نمط اعتماد الأمندمنت') {
    Write-Host "X CONTRACTS.md missing Section BK" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section BK" -ForegroundColor Green

$billPage = Get-Content -LiteralPath "app/bills/[id]/page.tsx" -Raw
if ($billPage -notmatch 'discountGate !== "open"' -or $billPage -notmatch 'اعتمد الخصم أولاً') {
    Write-Host "X bill view missing gate on approve button" -ForegroundColor Red; exit 1
}
$invPage = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($invPage -notmatch 'اعتمد الخصم أولاً') {
    Write-Host "X invoice view missing gate on Mark as Sent button" -ForegroundColor Red; exit 1
}
Write-Host "+ bill + invoice views gate the primary approve button" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_464.txt"
    $msgLines = @(
        'feat(approval): v3.74.464 - unify amendment approval flow with the PO pattern',
        '',
        'Owner asked: use the same idea as PO creation - notifications',
        'and approve-button position/behavior. The bill/invoice view',
        'previously had a second approve button that bypassed the diff',
        'card on /approvals. Owner could approve one path without the',
        'other, leaving the document inconsistent.',
        '',
        'UI',
        '   Bill view + invoice view: primary approve / mark-sent',
        '   button is DISABLED when discountGate !== open. Tooltip and',
        '   hint text point the owner to /approvals to review and',
        '   approve the discount first (with the full diff card).',
        '',
        'DB',
        '   New trigger sync_bill_status_on_discount_decision_trg on',
        '   discount_approvals AFTER UPDATE:',
        '     approved  -> bill/invoice back to draft (accountant posts',
        '                  as usual)',
        '     rejected  -> bill stays pending_approval + rejection note',
        '   Handles purchase_invoice + sales_invoice document types.',
        '',
        'API',
        '   /api/bills/[id]/discount-approval and the invoice mirror',
        '   compute the gate for both status=draft AND',
        '   status=pending_approval (was draft only). Fixes the case',
        '   where the amended bill showed gate=open while the amendment',
        '   was still pending.',
        '',
        'Files',
        '   supabase/migrations/20260701000464_v3_74_464_unified_approval_gate.sql',
        '   app/api/bills/[id]/discount-approval/route.ts',
        '   app/api/invoices/[id]/discount-approval/route.ts',
        '   app/bills/[id]/page.tsx',
        '   app/invoices/[id]/page.tsx',
        '   CONTRACTS.md (Section BK added)',
        '   lib/version.ts -> 3.74.464'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.464 pushed - one approval path, mirrored on sales" -ForegroundColor Green
}
