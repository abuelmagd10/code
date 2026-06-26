$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.372.ps1") { Remove-Item -LiteralPath "push_v3.74.372.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.373"') {
    Write-Host "+ 3.74.373" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260626000373_v3_74_373_badge_discount_approval.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 373: badge_discount_approval" -ForegroundColor Green
} else { Write-Host "X missing migration 373" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'get_user_approval_badges',
    'discount_approval',
    "v_role = 'general_manager'"
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration body covers badge discount_approval branch" -ForegroundColor Green

$listRoute = "app/api/discount-approvals/route.ts"
if (-not (Test-Path -LiteralPath $listRoute)) { Write-Host "X missing list route" -ForegroundColor Red; exit 1 }
$listContent = Get-Content -LiteralPath $listRoute -Raw
if ($listContent -notmatch 'can_approve_discount') { Write-Host "X list route missing can_approve_discount guard" -ForegroundColor Red; exit 1 }
if ($listContent -notmatch 'from\("discount_approvals"\)') { Write-Host "X list route missing discount_approvals query" -ForegroundColor Red; exit 1 }
Write-Host "+ list route guarded by can_approve_discount" -ForegroundColor Green

$decideRoute = "app/api/discount-approvals/[id]/decide/route.ts"
if (-not (Test-Path -LiteralPath $decideRoute)) { Write-Host "X missing decide route" -ForegroundColor Red; exit 1 }
$decideContent = Get-Content -LiteralPath $decideRoute -Raw
if ($decideContent -notmatch 'decide_discount_approval') { Write-Host "X decide route missing RPC call" -ForegroundColor Red; exit 1 }
if ($decideContent -notmatch "decision must be 'approved' or 'rejected'") { Write-Host "X decide route missing decision validation" -ForegroundColor Red; exit 1 }
Write-Host "+ decide route wraps decide_discount_approval" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'PendingDiscountApproval') { Write-Host "X approvals page missing PendingDiscountApproval type" -ForegroundColor Red; exit 1 }
if ($page -notmatch 'DiscountApprovalCard') { Write-Host "X approvals page missing DiscountApprovalCard" -ForegroundColor Red; exit 1 }
if ($page -notmatch 'activeTab === "disc"') { Write-Host "X approvals page missing disc tab branch" -ForegroundColor Red; exit 1 }
if ($page -notmatch '/api/discount-approvals\?company_id') { Write-Host "X approvals page does not fetch discount inbox" -ForegroundColor Red; exit 1 }
Write-Host "+ approvals page wired with discounts tab" -ForegroundColor Green

$sidebar = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sidebar -notmatch 'pendingInboxCount') { Write-Host "X sidebar missing pendingInboxCount" -ForegroundColor Red; exit 1 }
if ($sidebar -notmatch 'discount_approval') { Write-Host "X sidebar inbox count missing discount_approval key" -ForegroundColor Red; exit 1 }
Write-Host "+ sidebar inbox badge includes discount_approval" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_373.txt"
    $msgLines = @(
        'feat(approvals): v3.74.373 - discount approval inbox UI (Stage 2 of 5)',
        '',
        'Stage 2 of the discount-approval rollout: surface the foundation',
        'we landed in v3.74.372 to the approver. Owner asked us to reuse',
        'the existing /approvals inbox rather than spin up a new page,',
        'so this stage extends the inbox in place. No gates are wired up',
        'yet - sales invoices, purchase invoices, and bookings continue',
        'to behave exactly as before. Discount approvals can be created',
        'directly via request_discount_approval(), but nothing in the',
        'product calls that yet.',
        '',
        'What changed',
        '  /approvals page',
        '    + new tab "خصومات" alongside BOMs / Routings / POs / MIs',
        '    + DiscountApprovalCard renders party, document, requested',
        '      value (with percent of total when amount-based), and the',
        '      requester email',
        '    + Approve / Reject buttons hit the new endpoints below',
        '    + Refresh button + total-pending badge already accounted',
        '      for the new tab',
        '  api',
        '    GET  /api/discount-approvals',
        '      lists pending approvals for the active company',
        '      guarded by can_approve_discount so non-approvers get 403',
        '      enriches each row with the requester email via service',
        '      role lookup (best-effort, never blocks the inbox)',
        '    POST /api/discount-approvals/[id]/decide',
        '      thin wrapper around decide_discount_approval(approved|',
        '      rejected, note). Maps "not pending" RAISE EXCEPTIONs to',
        '      409 so the page can just refresh',
        '  sidebar',
        '    new pendingInboxCount = manufacturing approvals +',
        '    discount_approval. The "🔔 صندوق الموافقات" tile inside',
        '    Manufacturing now shows the rolled-up count. Manufacturing',
        '    module header keeps its existing manufacturing-only count.',
        '  DB',
        '    extend get_user_approval_badges to count discount_approval',
        '    pending rows for owner / admin / general_manager only',
        '    body is byte-identical to v3.74.372 except the trailing',
        '    block that adds the discount_approval key',
        '',
        'Next stages',
        '  v3.74.374 - wire booking activation gate (تنفيذ الخدمة)',
        '  v3.74.375 - wire sales invoice posting gate',
        '  v3.74.376 - wire purchase invoice posting gate',
        '',
        'Files',
        '  app/approvals/page.tsx',
        '  app/api/discount-approvals/route.ts',
        '  app/api/discount-approvals/[id]/decide/route.ts',
        '  components/sidebar.tsx',
        '  supabase/migrations/20260626000373_v3_74_373_badge_discount_approval.sql',
        '  lib/version.ts -> 3.74.373',
        '',
        'Note',
        '  Badge RPC already applied to live DB via Supabase MCP.',
        '  SQL file committed for future supabase db reset parity.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.373 pushed" -ForegroundColor Green
}
