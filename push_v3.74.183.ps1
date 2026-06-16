$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.182.ps1") { Remove-Item -LiteralPath "push_v3.74.182.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.183"') { Write-Host "+ 3.74.183" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

# Test-Path treats [id] as a wildcard glob — use -LiteralPath so the
# literal "[id]" folder name is matched exactly.
if (-not (Test-Path -LiteralPath "app/api/customers/refund-requests/route.ts")) { Write-Host "X create route missing" -ForegroundColor Red; exit 1 }
if (-not (Test-Path -LiteralPath "app/api/customers/refund-requests/[id]/approve/route.ts")) { Write-Host "X approve route missing" -ForegroundColor Red; exit 1 }
if (-not (Test-Path -LiteralPath "app/api/customers/refund-requests/[id]/reject/route.ts")) { Write-Host "X reject route missing" -ForegroundColor Red; exit 1 }
Write-Host "+ 3 new routes for customer refund workflow" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_183.txt"
    $msgLines = @(
        "feat(customers): v3.74.183 - approval workflow for customer credit refund",
        "",
        "Mirrors the supplier-side workflow (v3.74.177-181) so cash leaving",
        "the company against a customer credit also passes through",
        "management approval. Before this commit, /api/customers/refunds",
        "posted the JE immediately for any role, leaving an unattended",
        "control gap.",
        "",
        "New behaviour:",
        "  - Non-privileged roles (accountant, manager, staff, ...) file a",
        "    'credit_refund' request. The dialog calls",
        "      POST /api/customers/refund-requests",
        "    which inserts a row in customer_refund_requests with",
        "    source_type='credit_refund', status='pending', and sends a",
        "    notification to admin (UI cross-visibility lifts it to owner",
        "    and general_manager too).",
        "  - Owner / admin / general_manager keep the existing immediate",
        "    path through /api/customers/refunds for back-office speed.",
        "  - Approval queue page (/customer-refund-requests) routes",
        "    credit_refund requests to the new endpoints:",
        "      POST /api/customers/refund-requests/[id]/approve",
        "      POST /api/customers/refund-requests/[id]/reject",
        "  - The approve endpoint calls the same CustomerRefundCommand",
        "    Service.recordRefund the dialog used to call directly, so the",
        "    JE is identical (with operationId-based reference_id from",
        "    v3.74.182, no DUPLICATE_JOURNAL_VIOLATION risk).",
        "",
        "Files:",
        "",
        "  supabase/migrations/20260616000183_v3_74_183_customer_refund_requests_credit_refund.sql",
        "    - Adds refund_account_id, branch_id, cost_center_id,",
        "      refund_method, currency, exchange_rate, base_amount,",
        "      refund_date, rejected_by, rejected_at to",
        "      customer_refund_requests.",
        "    - Status check extended with 'rejected'.",
        "    - Table added to supabase_realtime publication.",
        "",
        "  app/api/customers/refund-requests/route.ts (new)",
        "    - POST: validates inputs, inserts pending row, dispatches",
        "      admin notification via create_notification RPC.",
        "",
        "  app/api/customers/refund-requests/[id]/approve/route.ts (new)",
        "    - Privileged-only, segregation-of-duties enforced (requester",
        "      != approver). Runs recordRefund and seals the row to",
        "      'executed' with approved_by + executed_by stamps. Notifies",
        "      the requester.",
        "",
        "  app/api/customers/refund-requests/[id]/reject/route.ts (new)",
        "    - Privileged-only. Updates row to 'rejected' with reason +",
        "      rejected_by/at. Notifies the requester.",
        "",
        "  components/customers/customer-refund-dialog.tsx",
        "    - Splits the submit endpoint by role: non-privileged users",
        "      hit refund-requests (request), privileged users hit",
        "      refunds (immediate). Different toast for each path.",
        "",
        "  app/customers/page.tsx",
        "    - Loads customer_refund_requests (branch-scoped for non-",
        "      privileged roles), wires realtime updates, and replaces",
        "      the disburse button with an in-flight pill",
        "      (⏳ pending / ✓ approved) when the latest request for the",
        "      customer is non-terminal. balances guard preserved.",
        "",
        "  app/customer-refund-requests/page.tsx",
        "    - Approve/reject buttons route to the new endpoints when the",
        "      row's source_type is 'credit_refund'. payment_correction",
        "      rows still flow through the legacy endpoints unchanged.",
        "",
        "  lib/realtime-manager.ts",
        "    - 'customer_refund_requests' added to RealtimeTable type and",
        "      table mapping.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.183.",
        "",
        "How to verify:",
        "  - As branch accountant: open /customers, click Disburse on a",
        "    customer with a positive credit balance. The dialog submits",
        "    a request and the row's button immediately turns into",
        "    '⏳ قَيد الاعتماد' (realtime).",
        "  - As owner in another tab: a 'طلب صرف رصيد عميل' notification",
        "    arrives. Open /customer-refund-requests, the new credit_refund",
        "    row is in the queue. Approve - the accountant gets a 'تم",
        "    اعتماد' notification, the JE is posted via recordRefund, the",
        "    pill clears (no more credit available, button disappears).",
        "  - Reject path: similar; the accountant's pill clears and the",
        "    button reappears so they can resubmit."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.183 pushed" -ForegroundColor Green
}
