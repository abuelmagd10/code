$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.172.ps1") { Remove-Item -LiteralPath "push_v3.74.172.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.173"') { Write-Host "+ 3.74.173" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$newPage = Get-Content -LiteralPath "app/purchase-returns/new/page.tsx" -Raw
if ($newPage -notmatch 'refund_account_id') {
    Write-Host "X new page does not pass refund_account_id" -ForegroundColor Red
    exit 1
}
Write-Host "+ new page passes refund_account_id" -ForegroundColor Green

$listPage = Get-Content -LiteralPath "app/purchase-returns/page.tsx" -Raw
if ($listPage -match 'Record Refund Received') {
    Write-Host "X manual refund button still present" -ForegroundColor Red
    exit 1
}
Write-Host "+ manual refund button removed" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_173.txt"
    $msgLines = @(
        "feat(purchase-returns): v3.74.173 - auto-execute cash/bank refund on warehouse confirm",
        "",
        "Tester report on PRET-67525:",
        "  - Accountant chose settlement_method='cash' and 'خزينة مدينة نصر',",
        "    but the details page did not show the chosen treasury.",
        "  - Refund button appeared only for the owner, not for the creator.",
        "  - Underneath: AP 1180 stayed open at 2 EGP, no cash entry was",
        "    ever written, the manual refund button only flipped status.",
        "",
        "Decision: kill the manual button and auto-execute the cash refund",
        "at warehouse confirm. The accountant already picked the treasury",
        "at creation time; the warehouse already confirms the physical",
        "exchange happened. No room left to forget the refund.",
        "",
        "Fix:",
        "",
        "  supabase/migrations/20260615000173_v3_74_173_purchase_return_auto_refund_on_cash.sql",
        "    - New column purchase_returns.refund_account_id (FK to",
        "      chart_of_accounts) for the chosen cash/bank account.",
        "    - workflow_status CHECK constraint extended to allow 'closed'.",
        "    - process_purchase_return_atomic now reads",
        "      p_purchase_return->>'refund_account_id' and persists it.",
        "    - confirm_purchase_return_delivery_v2 now checks settlement_method",
        "      IN ('cash','bank_transfer') AND refund_account_id IS NOT NULL.",
        "      When that holds, the vc_debit portion is debited against",
        "      refund_account_id directly (instead of vendor_credit_liability),",
        "      no vendor_credits row is created, and the return seals to",
        "      status='closed', workflow_status='closed',",
        "      financial_status='refund_recorded'. AP-reduction portion is",
        "      untouched.",
        "    - When refund_account_id is null (e.g., debit_note / credit),",
        "      the original vendor_credit_liability path runs unchanged.",
        "",
        "  app/purchase-returns/new/page.tsx",
        "    - All three submit paths (multi-warehouse, resubmit, single)",
        "      now include refund_account_id in the payload when settlement",
        "      is cash/bank_transfer. Validation no longer gated by",
        "      isBillPaid - refund account is required for any cash/bank",
        "      settlement.",
        "",
        "  app/purchase-returns/page.tsx",
        "    - Manual 'تسجيل استلام الاسترداد' button removed. Comment in",
        "      its place explains the auto-execution.",
        "",
        "  app/purchase-returns/[id]/page.tsx",
        "    - SELECT includes refund_account_id and the linked chart_of_accounts",
        "      row. Details panel adds a new 'حساب الاسترداد' row showing the",
        "      account code + name when settlement is cash/bank.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.173.",
        "",
        "Manual remediation applied to PRET-67525:",
        "  - refund_account_id set to 1001 (خزينة الشركة مدينة نصر, the",
        "    treasury for the branch).",
        "  - JE lines wiped and rewritten as Dr 1001 / Cr 1140 = 2.",
        "  - status, workflow_status and financial_status set to the sealed",
        "    values (closed / closed / refund_recorded).",
        "  - ic_ap_balance and ic_inventory_gl_vs_fifo return 0 rows.",
        "",
        "How to verify going forward:",
        "  - Create a cash-settled purchase return, choose a refund treasury.",
        "    After admin and warehouse approval, the return shows 'مكتمل +",
        "    استرداد' and the JE includes Dr <chosen treasury> / Cr 1140.",
        "    The supplier ledger does not carry an open vendor credit.",
        "  - Same for bank_transfer."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.173 pushed" -ForegroundColor Green
}
