$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.208.ps1") { Remove-Item -LiteralPath "push_v3.74.208.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.209"') {
    Write-Host "+ 3.74.209" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$svc = Get-Content -LiteralPath "lib/services/customer-payment-command.service.ts" -Raw
if ($svc -notmatch "Compensating action") {
    Write-Host "X service missing compensating action on failure" -ForegroundColor Red; exit 1
}
if ($svc -notmatch "VOIDED: createPayment failed after insert") {
    Write-Host "X service missing void marker" -ForegroundColor Red; exit 1
}
Write-Host "+ service voids the payment row on downstream failure" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_209.txt"
    $msgLines = @(
        "fix(customer-payment): v3.74.209 - bulk-collection failures no longer leave phantom payment rows",
        "",
        "Symptom: the payments page surfaced a 5 EGP cash payment for محمد",
        "بسيونى marked 'غير مرتبط' (not linked) with no reference number,",
        "no invoice link, and no JE backing. The user (rightly) flagged it",
        "as data corruption.",
        "",
        "Root cause: CustomerPaymentCommandService.createPayment does three",
        "Supabase calls in sequence -",
        "  1. INSERT payments row (approved, unallocated=amount-totalAllocated)",
        "  2. applyAllocation for each invoice in command.allocations",
        "  3. finalizeApprovedPayment (posts the JE)",
        "Supabase doesn't wrap these in a transaction. When the v3.74.208",
        "trigger (then incomplete) blocked step 2 / 3 with",
        "  لا يمكن تعديل الفاتورة المدفوعة. الحقل المعدل: original_paid.",
        "the inserted row from step 1 stayed approved in the DB - a phantom",
        "advance that the page showed as ready to apply.",
        "",
        "Fix:",
        "  lib/services/customer-payment-command.service.ts",
        "    - Wraps steps 2 and 3 in try/catch. On failure we soft-void",
        "      the just-inserted payment row (is_deleted=true, status=",
        "      rejected, notes annotated) so it disappears from every",
        "      payments-page query. We avoid a hard DELETE because the",
        "      audit_payment_changes trigger references payments.id via",
        "      FK and rejects the cascade.",
        "",
        "Data fix: the one orphaned row from before the deploy was soft-",
        "voided in-place via the same shape (is_deleted=true,",
        "status='rejected') with an audit_logs trace.",
        "",
        "  lib/version.ts -> 3.74.209."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.209 pushed" -ForegroundColor Green
}
