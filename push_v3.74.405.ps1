$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.404.ps1") { Remove-Item -LiteralPath "push_v3.74.404.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.405"') {
    Write-Host "+ 3.74.405" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$listPage = Get-Content -LiteralPath "app/bills/page.tsx" -Raw
foreach ($n in @(
    '/api/bills/${encodeURIComponent(id)}/void',
    'v3.74.405',
    'تم إلغاء الفاتورة',
    'تأكيد إلغاء الفاتورة'
)) {
    if ($listPage -notmatch [regex]::Escape($n)) {
        Write-Host "X bills/page.tsx missing: $n" -ForegroundColor Red; exit 1
    }
}
# verify raw delete is gone
if ($listPage -match 'supabase\.from\("bills"\)\.delete\(\)') {
    Write-Host "X bills/page.tsx still calls raw supabase delete on bills" -ForegroundColor Red; exit 1
}
if ($listPage -match 'supabase\.from\("bill_items"\)\.delete\(\)') {
    Write-Host "X bills/page.tsx still calls raw supabase delete on bill_items" -ForegroundColor Red; exit 1
}
Write-Host "+ bills/page.tsx routes through /api/bills/[id]/void (no raw deletes)" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'v3\.74\.405 — قائمة الفواتير') {
    Write-Host "X CONTRACTS.md missing v3.74.405 entry" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md updated" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_405.txt"
    $msgLines = @(
        'fix(bills): v3.74.405 - list-page delete also routes through void',
        '',
        'Owner found a second delete button on /bills (list view) that',
        'still bypassed void_bill_atomic. Clicking it on BILL-0001 hard-',
        'deleted the row directly via supabase.from("bills").delete().',
        'PO-0001 was left "approved" with bill_id pointing at a deleted',
        'row, and the discount_approvals + audit chain were not',
        'maintained. v3.74.402 fixed this surface on the detail page',
        'but the list page was a separate code path we missed.',
        '',
        'Fix: handleDelete in app/bills/page.tsx now POSTs to',
        '/api/bills/[id]/void exactly like the detail page does, so the',
        'cascade (status=voided, PO unblocked, discount approvals',
        'cancelled, audit_log written) runs consistently from both',
        'surfaces.',
        '',
        'Confirm dialog and toast strings were updated from',
        '"Delete / حذف" to "Void / إلغاء" with the explanation that the',
        'PO will be unblocked.',
        '',
        'Data fix',
        '  PO-0001 was left in {status=approved, bill_id=NULL} from the',
        '  earlier hard delete. Reset to status=pending_approval so the',
        '  owner can re-approve and get a fresh bill auto-created via',
        '  approve_purchase_order_atomic.',
        '',
        'Files',
        '  app/bills/page.tsx',
        '  CONTRACTS.md (Section N updated)',
        '  lib/version.ts -> 3.74.405'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.405 pushed - list-page delete routes through void" -ForegroundColor Green
    Write-Host "  PO-0001 reopened to pending_approval - owner can re-approve to get a fresh bill." -ForegroundColor Cyan
}
