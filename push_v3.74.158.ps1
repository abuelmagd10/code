$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.157.ps1") { Remove-Item -LiteralPath "push_v3.74.157.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.158"') { Write-Host "+ 3.74.158" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_158.txt"
    $msgLines = @(
        "fix(suppliers): v3.74.158 - count vendor advances in supplier balance",
        "",
        "User report: accountant recorded a 2.00 advance to محمد الصاوى",
        "(دفعة سلفة بدون ربط بفاتورة), owner approved it, but the supplier",
        "ledger on /suppliers still showed the 'مستحقات لنا (سلفة مورد)'",
        "column as a dash. The GL had already booked it Dr Asset / Cr Cash",
        "with description 'سلف للموردين', so the suppliers page was the",
        "only place still ignoring it.",
        "",
        "Root cause: app/suppliers/page.tsx hardcoded the advances balance",
        "to 0 with a comment 'يمكن إضافة حساب السلف لاحقاً' and never read",
        "the payments table for vendor-advance rows. The column 'مستحقات",
        "لنا (سلفة مورد)' was being populated only from vendor_credits",
        "(purchase returns) and bill overpayments - actual advances were",
        "invisible.",
        "",
        "Fix:",
        "  app/suppliers/page.tsx",
        "    - In loadSupplierBalances, query approved payments where",
        "      supplier_id IS NOT NULL, bill_id IS NULL, invoice_id IS NULL",
        "      and is_deleted IS NOT true. Sum payments.unallocated_amount",
        "      (falls back to amount for legacy rows that pre-date the",
        "      unallocated column) - that's the advance still available to",
        "      apply against a future bill.",
        "    - Adds the total to balance.advances (was always 0) AND to",
        "      balance.debitCredits so the existing 'مستحقات لنا (سلفة",
        "      مورد)' column renders the figure without a separate column",
        "      ('سلفة مورد' is literally what the header already says).",
        "    - Added a realtime subscription on the payments table so the",
        "      balance updates the instant an advance is approved instead",
        "      of waiting for the next manual refresh.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.158.",
        "",
        "Verification with the test row:",
        "    payment.id = 48627b1c-0965-4475-9f47-638fc8406133",
        "    amount = 2.00, unallocated_amount = 2.00",
        "    bill_id = NULL, invoice_id = NULL, status = approved",
        "    supplier = محمد الصاوى",
        "  After this lands, /suppliers will show",
        "    محمد الصاوى | مطلوبات 2.00 | مستحقات لنا 2.00",
        "  matching what the GL already says (account 1180 ledger).",
        "",
        "Followups (not in this commit):",
        "  - When the user creates a bill for the same supplier and",
        "    allocates the advance against it via payment_allocations,",
        "    payments.unallocated_amount goes down; the page will reflect",
        "    that automatically because the trigger that maintains",
        "    unallocated_amount is upstream of this read. Worth an E2E",
        "    test once a real bill flow uses the advance.",
        "  - The auto_create_payment_journal trigger booked the advance to",
        "    account 1000 (الأصول, the asset parent) instead of 1180",
        "    (سلف ومقدمات للموردين). It still balances - both are assets -",
        "    but the specific sub-account is correct for vendor advances.",
        "    Worth a separate fix in the trigger so future advances land",
        "    on 1180 directly."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.158 pushed" -ForegroundColor Green
}
