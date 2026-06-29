$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.401.ps1") { Remove-Item -LiteralPath "push_v3.74.401.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.402"') {
    Write-Host "+ 3.74.402" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

foreach ($f in @(
    'supabase/migrations/20260629000402_v3_74_402_void_bill_atomic.sql',
    'app/api/bills/[id]/void/route.ts'
)) {
    if (-not (Test-Path -LiteralPath $f)) {
        Write-Host "X missing: $f" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration + API route present" -ForegroundColor Green

$ui = Get-Content -LiteralPath "app/bills/[id]/page.tsx" -Raw
foreach ($n in @('handleVoid', '/api/bills/${encodeURIComponent(bill.id)}/void', 'إلغاء الفاتورة', 'v3.74.402')) {
    if ($ui -notmatch [regex]::Escape($n)) {
        Write-Host "X UI missing: $n" -ForegroundColor Red; exit 1
    }
}
if ($ui -match 'onClick=\{handleDelete\}') {
    Write-Host "X UI still wires handleDelete to a button" -ForegroundColor Red; exit 1
}
Write-Host "+ bills/[id]/page.tsx wired to handleVoid (no live handleDelete onClick)" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'N\. إلغاء الفاتورة') {
    Write-Host "X CONTRACTS.md missing Section N" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md updated with Section N" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_402.txt"
    $msgLines = @(
        'feat(bills): v3.74.402 - replace delete with void + unblock PO',
        '',
        'Owner observed a Delete button on the bill view page and asked',
        'whether hard-deleting a draft bill could damage the app. The',
        'concern was justified:',
        '  * The PO that auto-created the bill keeps a dangling bill_id',
        '    pointing at the deleted row.',
        '  * Pending discount_approvals on the bill become orphaned.',
        '  * Notifications referencing the bill become dead links.',
        '  * Any report that already counted the bill shifts retroactively.',
        '  * Egyptian + international accounting practice requires an',
        '    immutable audit trail — voids, not deletes.',
        '',
        'Resolution: replace the hard-delete UI with a Void action that',
        'flips status to "voided" and unblocks the source PO so the',
        'owner can re-approve and get a fresh bill auto-created.',
        '',
        'DB (applied via Supabase MCP)',
        '  bills.voided_by, voided_at, voided_reason columns added.',
        '  RPC void_bill_atomic(bill_id, user_id, company_id, reason):',
        '    * gate: status=draft + no payments',
        '    * roles: owner / admin / general_manager / accountant',
        '    * sets bills.status=voided + voided_by + voided_at',
        '    * cancels pending discount_approvals on the bill',
        '    * unblocks linked PO: bill_id=NULL, status=pending_approval',
        '    * audit_logs row with action=VOID',
        '  Section N added to assert_baseline. Function body must',
        '  contain "bill_id = NULL", "pending_approval",',
        '  "discount_approvals", "status = ''voided''" - a future',
        '  migration that drops any of those fails baseline.',
        '',
        'API',
        '  app/api/bills/[id]/void/route.ts -> calls void_bill_atomic.',
        '  Legacy /delete route stays in place but no UI calls it; can',
        '  be removed in a future migration once nothing references it.',
        '',
        'UI',
        '  app/bills/[id]/page.tsx',
        '    handleDelete renamed to handleVoid; targets /void route.',
        '    AlertDialog text updated to explain the unblock behavior.',
        '    Button label now reads "إلغاء" / "Void".',
        '',
        'Files',
        '  supabase/migrations/20260629000402_v3_74_402_void_bill_atomic.sql',
        '  app/api/bills/[id]/void/route.ts',
        '  app/bills/[id]/page.tsx',
        '  CONTRACTS.md (Section N added)',
        '  lib/version.ts -> 3.74.402'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.402 pushed - void replaces delete + PO unblock" -ForegroundColor Green
    Write-Host "  Test: open BILL-0001 -> click إلغاء. Bill becomes voided; PO-0001 goes back to pending_approval ready for re-approval." -ForegroundColor Cyan
}
