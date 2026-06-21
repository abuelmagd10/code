$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.252.ps1") { Remove-Item -LiteralPath "push_v3.74.252.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.253"') {
    Write-Host "+ 3.74.253" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = Get-Content -LiteralPath "supabase/migrations/20260620000253_v3_74_253_refund_requests_table.sql" -Raw
foreach ($c in @('CREATE TABLE','refund_requests','pending_approval','approved_completed','uq_refund_requests_active_per_source')) {
    if ($mig -notmatch [regex]::Escape($c)) { Write-Host "X migration missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ migration creates refund_requests table" -ForegroundColor Green

$shipApi = Get-Content -LiteralPath "app/api/invoices/[id]/pre-shipment-refund/route.ts" -Raw
foreach ($c in @('SELF_EXECUTE_ROLES','refund_requests','pending_approval','executed: false','executed: true')) {
    if ($shipApi -notmatch [regex]::Escape($c)) { Write-Host "X invoice refund route missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ invoice refund route branches on role" -ForegroundColor Green

$rcptApi = Get-Content -LiteralPath "app/api/bills/[id]/pre-receipt-refund/route.ts" -Raw
foreach ($c in @('SELF_EXECUTE_ROLES','refund_requests','pending_approval')) {
    if ($rcptApi -notmatch [regex]::Escape($c)) { Write-Host "X bill refund route missing $c" -ForegroundColor Red; exit 1 }
}
Write-Host "+ bill refund route branches on role" -ForegroundColor Green

foreach ($p in @(
  "app/api/refund-requests/[id]/approve/route.ts",
  "app/api/refund-requests/[id]/reject/route.ts",
  "app/api/refund-requests/[id]/cancel/route.ts",
  "app/api/refund-approvals/route.ts",
  "app/refund-approvals/page.tsx"
)) {
    if (-not (Test-Path -LiteralPath $p)) {
        Write-Host "X missing $p" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ refund-requests approve / reject / cancel + listing + page all present" -ForegroundColor Green

$side = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($side -notmatch [regex]::Escape("/refund-approvals")) {
    Write-Host "X sidebar missing refund-approvals link" -ForegroundColor Red; exit 1
}
Write-Host "+ sidebar links to /refund-approvals" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_253.txt"
    $msgLines = @(
        "feat(refunds): v3.74.253 - owner / GM approval workflow for pre-shipment / pre-receipt refunds",
        "",
        "Segregation of duties: the cashier shouldn't authorise the cash",
        "that leaves their own drawer. Before this version, anyone in the",
        "set (owner, general_manager, admin, manager, accountant) could",
        "execute a refund directly. From v3.74.253 only owner and general_",
        "manager self-execute; everyone else creates a refund_request that",
        "lands in the new /refund-approvals queue.",
        "",
        "Database",
        "  refund_requests table (polymorphic source_type invoice|bill).",
        "  Unique partial index uq_refund_requests_active_per_source",
        "  prevents two cashiers racing the same source.",
        "  RLS: company isolation; service-role writes bypass.",
        "",
        "API",
        "  POST /api/invoices/[id]/pre-shipment-refund now branches:",
        "    owner / GM    -> execute immediately (existing behavior)",
        "    other roles   -> insert pending_approval into refund_requests,",
        "                     return { executed:false, pending_approval:true }.",
        "  Same for POST /api/bills/[id]/pre-receipt-refund.",
        "  New endpoints:",
        "    POST /api/refund-requests/[id]/approve  - owner / GM only,",
        "      runs the same executor and stamps approved_at + executor JE.",
        "    POST /api/refund-requests/[id]/reject   - owner / GM only,",
        "      with optional rejection reason.",
        "    POST /api/refund-requests/[id]/cancel   - the requester or",
        "      owner / GM may cancel a pending request.",
        "    GET  /api/refund-approvals             - hydrated list for",
        "      the approvals page (source number + party name).",
        "",
        "UI",
        "  /refund-approvals page: filterable table (pending / approved /",
        "    rejected / cancelled / all), search by invoice/bill number or",
        "    party, per-row Approve / Reject actions. Reject dialog with",
        "    optional reason. Sidebar link added under Inventory section.",
        "  Invoice page + Bill page: the existing refund dialog now reads",
        "    the response shape -> shows 'submitted for approval' toast",
        "    when pending_approval=true, otherwise the existing 'executed'",
        "    toast. The dialog itself is unchanged; the API decides the",
        "    branch.",
        "",
        "Doesn't disturb the legacy customer-credit-refund routes that",
        "live under /api/refund-requests/(approve|reject|disburse|reopen)",
        "- they target a different domain and are preserved intact.",
        "",
        "Files",
        "  supabase/migrations/20260620000253_v3_74_253_refund_requests_table.sql",
        "  app/api/invoices/[id]/pre-shipment-refund/route.ts",
        "  app/api/bills/[id]/pre-receipt-refund/route.ts",
        "  app/api/refund-requests/[id]/approve/route.ts (new)",
        "  app/api/refund-requests/[id]/reject/route.ts (new)",
        "  app/api/refund-requests/[id]/cancel/route.ts (new)",
        "  app/api/refund-approvals/route.ts (new)",
        "  app/refund-approvals/page.tsx (new)",
        "  app/invoices/[id]/page.tsx",
        "  app/bills/[id]/page.tsx",
        "  components/sidebar.tsx",
        "  lib/version.ts -> 3.74.253"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.253 pushed" -ForegroundColor Green
}
