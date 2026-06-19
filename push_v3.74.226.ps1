$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.225.ps1") { Remove-Item -LiteralPath "push_v3.74.225.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.226"') {
    Write-Host "+ 3.74.226" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

# Guard 1: refund service writes created_by so the modal stops showing "غَير مُسَجَّل"
$svc = Get-Content -LiteralPath "lib/services/customer-refund-command.service.ts" -Raw
if ($svc -notmatch "createdBy:\s*actor\.actorId" -or $svc -notmatch "created_by:\s*params\.createdBy") {
    Write-Host "X customer-refund service still missing created_by propagation" -ForegroundColor Red; exit 1
}
Write-Host "+ customer-refund service propagates actor.actorId to payment row" -ForegroundColor Green

# Guard 2: voucher service mirrors the same fix
$vch = Get-Content -LiteralPath "lib/services/customer-voucher-command.service.ts" -Raw
if ($vch -notmatch "createdBy:\s*actor\.actorId" -or $vch -notmatch "created_by:\s*params\.createdBy") {
    Write-Host "X customer-voucher service still missing created_by propagation" -ForegroundColor Red; exit 1
}
Write-Host "+ customer-voucher service propagates actor.actorId to payment row" -ForegroundColor Green

# Guard 3: payment details modal shows native amount for cross-currency rows
$modal = Get-Content -LiteralPath "components/payments/PaymentDetailsModal.tsx" -Raw
if ($modal -notmatch "headerIsFC" -or $modal -notmatch "Math\.abs\(headerOrigAmt\) > 0") {
    Write-Host "X payment details modal header still mixes base amount with FC label" -ForegroundColor Red; exit 1
}
Write-Host "+ payment details modal header shows original_amount + base equivalent" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_226.txt"
    $msgLines = @(
        "fix(refund-details): v3.74.226 - creator name, FC header amount, audit trail",
        "",
        "Three observations on the same cross-currency refund row REF-1781864634620:",
        "",
        "1) Payment details modal showed 'مُنشِئ الدَّفعَة: غَير مُسَجَّل'.",
        "   Root cause: customer-refund-command service inserted the payment",
        "   row WITHOUT setting created_by. The modal queries auth.users via",
        "   company_members on payment.created_by, so a null column always",
        "   degraded to 'Not recorded' / 'غَير مُسَجَّل'.",
        "   Fix: insertRefundPayment now accepts and writes created_by, and",
        "   the caller passes actor.actorId. Same fix applied preemptively to",
        "   customer-voucher-command service, which had the identical leak.",
        "",
        "2) Header read '-0.55 USD' on a cross-currency refund.",
        "   The renderer used `fmtAmount(payment.amount)` (the base-currency",
        "   figure) together with `payment.currency_code` (the original",
        "   currency tag) — mixing the two. Rows on the payments LIST already",
        "   show the right format thanks to v3.74.225, but the DETAILS modal",
        "   header was independent.",
        "   Fix in components/payments/PaymentDetailsModal.tsx: when",
        "   original_currency differs from base, header shows original_amount",
        "   in original_currency as the primary, with the base equivalent",
        "   underneath as '≈ <baseAmount> <baseCurrency>'. Same-currency rows",
        "   keep the single-line behaviour.",
        "",
        "3) Approval-trail 'إِنشاء' event showed 'مُستَخدِم غَير مُحَدَّد'.",
        "   Same root cause as #1: created_by null on the source row meant",
        "   the audit-log trigger had nothing to record.",
        "",
        "Backfill: payment 8cbd4b30 + its 3 payment_audit_logs rows attributed",
        "to 7esab.erb@gmail.com (the company owner who created the refund).",
        "",
        "  lib/services/customer-refund-command.service.ts",
        "  lib/services/customer-voucher-command.service.ts",
        "  components/payments/PaymentDetailsModal.tsx",
        "  lib/version.ts -> 3.74.226"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.226 pushed" -ForegroundColor Green
}
