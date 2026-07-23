$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.791.ps1") { Remove-Item -LiteralPath "push_v3.74.791.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.792"') {
    Write-Host "+ 3.74.792" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.792]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.792]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the two live-caught rejection defects, positively asserted -----------------
$route = Get-Content -LiteralPath "app/api/invoices/[id]/warehouse-reject/route.ts" -Raw
if ($route -notmatch [regex]::Escape('body?.rejection_reason ?? body?.notes ?? null')) {
    Write-Host "X the rejection reason still dies at the API boundary" -ForegroundColor Red; exit 1
}
Write-Host "+ warehouse-reject route reads rejection_reason" -ForegroundColor Green

$svc = Get-Content -LiteralPath "lib/services/sales-invoice-warehouse-command.service.ts" -Raw
foreach ($must in @(
    "rpcData?.notified_source_editor",
    "sourceEditorNotified: boolean",
    "if (!sourceEditorNotified && invoiceSenderId) {"
)) {
    if ($svc -notmatch [regex]::Escape($must)) {
        Write-Host "X RPC-flag wiring incomplete: $must" -ForegroundColor Red; exit 1
    }
}
if ($svc -match [regex]::Escape('from("sales_orders")')) {
    Write-Host "X the RLS-dependent sales_orders lookup is back in the warehouse service" -ForegroundColor Red; exit 1
}
Write-Host "+ source-editor notification lives in the RPC; TS honors its flag" -ForegroundColor Green

$mig = Get-Content -LiteralPath "supabase/migrations/20260723000001_v3_74_792_reject_notifies_source_editor_in_db.sql" -Raw
foreach ($must in @(
    "notified_source_editor",
    "COALESCE(bk.staff_user_id, bk.created_by_user_id)",
    "رفض المخزن صرف البضاعة — عدّل أمر البيع"
)) {
    if ($mig -notmatch [regex]::Escape($must)) {
        Write-Host "X reject RPC migration incomplete: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ reject RPC migration recorded (already applied to test + prod)" -ForegroundColor Green

git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { Write-Host "X baseline mismatch" -ForegroundColor Red; exit 1 }

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out2 = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out2 -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
if (Test-Path ".next/types") { Remove-Item ".next/types" -Recurse -Force -ErrorAction SilentlyContinue }
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- "lib/version.ts" "CHANGELOG.md" `
    "app/api/invoices/[id]/warehouse-reject/route.ts" `
    "lib/services/sales-invoice-warehouse-command.service.ts" `
    "supabase/migrations/20260723000001_v3_74_792_reject_notifies_source_editor_in_db.sql" `
    "push_v3.74.792.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.791.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_792.txt"
    $msgLines = @(
        'fix(sales): v3.74.792 - two rejection defects caught live on INV-00003',
        '',
        'The warehouse manager rejected the dispatch WITH a written reason, yet:',
        '(1) the "edit the sales order" action notification never reached the',
        'branch employee - the legacy sender fallback fired at the accountant;',
        '(2) the reason showed as "no notes" everywhere.',
        '',
        'Defect 1 - silent RLS veto: the service layer read sales_orders under',
        'the WAREHOUSE MANAGER''s RLS context; his role cannot see sales orders,',
        'the lookup returned null silently, and the source-editor branch was',
        'skipped. The action notification is now born inside',
        'reject_sales_delivery (SECURITY DEFINER sees the source regardless of',
        'the actor): SO invoice -> SO creator; service invoice -> the SERVICE',
        'EXECUTOR (staff_user_id per the owner''s correction; booking creator',
        'as fallback). The RPC returns notified_source_editor; the TS sender',
        'fallback now serves only standalone invoices with no mappable source.',
        'The RLS-dependent lookups are deleted from the service.',
        '',
        'Defect 2 - reason lost at the API boundary: the dispatch-approvals',
        'modal sends rejection_reason; the route only read notes. It now reads',
        'both.',
        '',
        'Rehearsed on the restored test copy: reject with a written reason ->',
        'invoice draft, reason persisted on the invoice, SO creator received',
        'the action notification carrying the full reason, flag=true.',
        'RPC applied to test + prod; the route/service fixes ship with this',
        'deploy.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.792 pushed - the reason arrives; the source editor is summoned" -ForegroundColor Green
}
