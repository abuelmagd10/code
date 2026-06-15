$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.170.ps1") { Remove-Item -LiteralPath "push_v3.74.170.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.171"') { Write-Host "+ 3.74.171" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260615000171_v3_74_171_purchase_return_smart_je_and_fifo_reverse.sql")) {
    Write-Host "X migration file missing" -ForegroundColor Red
    exit 1
}
Write-Host "+ migration file present" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_171.txt"
    $msgLines = @(
        "fix(purchase-returns): v3.74.171 - smart JE rebuild + FIFO reverse",
        "",
        "Tester report: after the resubmitted PR-BILL-0002 was confirmed",
        "by warehouse, the integrity dashboard surfaced two anomalies:",
        "  - ic_ap_balance: AP ledger diverges from outstanding bills by 3",
        "  - ic_inventory_gl_vs_fifo: GL 1140 diverges from FIFO by -8",
        "",
        "Root causes (traced in the live ledger for the failing PR):",
        "",
        "  (A) BILL-0002 was fully paid (paid_amount = total_amount = 5)",
        "      when the return ran. process_purchase_return_atomic had",
        "      already created a draft journal entry with naive lines",
        "      from the app layer (Dr 2110 / Cr 1140 for the return total),",
        "      without checking whether the bill was paid. confirm_v2",
        "      saw v_je_id was non-null and only flipped the draft to",
        "      'posted' instead of rebuilding the lines using its own",
        "      AP / vendor_credit split. The PR ended up reducing AP by",
        "      3 even though there was no open AP balance on the bill,",
        "      so the AP balance went negative and no vendor_credit row",
        "      was generated.",
        "",
        "  (B) Purchase returns never wrote a reverse fifo_lot_consumption",
        "      or decremented the source lot's remaining_quantity. GL 1140",
        "      was credited by the return total, but the FIFO lot stayed",
        "      put, so FIFO remaining value drifted ahead of GL by the",
        "      returned cost. (Production receipt for product 398f added",
        "      another 5 EGP without a GL entry - filed as v3.74.172, out",
        "      of scope for this commit.)",
        "",
        "Fixes:",
        "  supabase/migrations/20260615000171_v3_74_171_purchase_return_smart_je_and_fifo_reverse.sql",
        "    - confirm_purchase_return_delivery_v2: when the draft JE",
        "      exists, DELETE its lines and rebuild using the same",
        "      v_ap_reduction / v_vc_debit logic the from-scratch branch",
        "      already had. The function is now the single source of",
        "      truth at confirm time.",
        "    - Same function: for each returned item, walk the FIFO lots",
        "      tied to the bill being returned (oldest first), decrement",
        "      remaining_quantity by the returned units, and write a",
        "      'purchase_return' consumption row that mirrors what",
        "      'sale' rows do.",
        "    - Vendor credit row is now emitted on every confirm with a",
        "      vc_debit portion, not just on debit_note/credit settlement.",
        "    - chart_of_accounts: account 1180 'سلف ومقدمات للموردين'",
        "      tagged with sub_type='vendor_credit_liability' where",
        "      currently null, so the smart-JE branch can find it.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.171.",
        "",
        "Manual remediation already applied to PR-BILL-0002:",
        "  - JE lines wiped and rebuilt with Dr 1180 / Cr 1140 = 3.",
        "  - FIFO lot for BILL-0002 (b6c44...) reduced from remaining=3",
        "    to remaining=0; consumption row 'purchase_return' added.",
        "  - vendor_credit row VC-BILL-0002-... created (status='open',",
        "    total=3) so the supplier ledger reflects the receivable.",
        "  - Verification: ic_ap_balance() returns 0 rows, ic_inventory_",
        "    gl_vs_fifo() returns 0 rows. Anomaly badges cleared.",
        "",
        "Out of scope (filed as v3.74.172):",
        "  - production_receipt creates a FIFO lot for finished goods but",
        "    does NOT write Dr 1140 / Cr 1145 (WIP) into journal_entries.",
        "    A 5 EGP residual drift remains under the tolerance of the",
        "    inventory integrity check but represents a real gap that",
        "    will grow with each manufacturing receipt."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.171 pushed" -ForegroundColor Green
}
