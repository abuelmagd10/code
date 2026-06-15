$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.162.ps1") { Remove-Item -LiteralPath "push_v3.74.162.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.163"') { Write-Host "+ 3.74.163" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

# Sanity check: p_created_by passed in single-warehouse RPC call
$svc = Get-Content -LiteralPath "lib/services/purchase-return-command.service.ts" -Raw
if ($svc -notmatch 'process_purchase_return_atomic[\s\S]{0,800}p_created_by') {
    Write-Host "X p_created_by not passed in single-warehouse RPC" -ForegroundColor Red
    exit 1
}
Write-Host "+ p_created_by wired into single-warehouse path" -ForegroundColor Green

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_163.txt"
    $msgLines = @(
        "fix(purchase-returns): v3.74.163 - rejection notification reaches creator",
        "",
        "Bug reported by tester: branch accountant creates a partial",
        "purchase return; owner + general manager get the approval-request",
        "notification correctly (confirmed in DB); owner rejects; but no",
        "notification reaches the creator about the rejection.",
        "",
        "Root cause:",
        "  lib/services/purchase-return-command.service.ts called the",
        "  process_purchase_return_atomic RPC for single-warehouse",
        "  returns WITHOUT passing p_created_by, so the new row had",
        "  created_by = NULL in the database.",
        "",
        "  notifyRejected() (and notifyApproved, notifyWarehouseRejected)",
        "  all start with `if (!purchaseReturn.created_by) return` - so",
        "  every creator-facing notification was silently dropped.",
        "",
        "  The multi-warehouse path (process_purchase_return_multi_warehouse)",
        "  already passed p_created_by; only the single path was broken.",
        "  Most user-facing returns hit the single path, which is why this",
        "  surfaces only now during purchase-cycle testing.",
        "",
        "Fix:",
        "  lib/services/purchase-return-command.service.ts",
        "    - Single-warehouse RPC call now passes p_created_by:",
        "      actor.actorId (same value the multi-warehouse path uses).",
        "    - The DB function already accepts p_created_by (default NULL)",
        "      so no migration is needed.",
        "    - Inline comment explains the constraint so the next person",
        "      adding a parameter does not drop this one.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.163.",
        "",
        "Backfill applied via SQL (already executed against production):",
        "  - purchase_returns.created_by populated for the rejected row",
        "    PR-BILL-0002-1781509180202 from audit_logs INSERT actor.",
        "  - The missing rejection notification was synthesized and",
        "    inserted via create_notification RPC so the original tester",
        "    can see it.",
        "",
        "How to verify:",
        "  - Create a fresh partial purchase return as a branch accountant.",
        "  - Query: SELECT created_by FROM purchase_returns ORDER BY",
        "    created_at DESC LIMIT 1 - the new row should have created_by",
        "    populated.",
        "  - Reject the return as owner. The creator's notification inbox",
        "    receives a 'تم رفض مرتجع المشتريات' notification.",
        "  - Approve a different return as owner. The creator sees the",
        "    'تم اعتماد مرتجع المشتريات' notification (also previously",
        "    blocked by the same bug)."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.163 pushed" -ForegroundColor Green
}
