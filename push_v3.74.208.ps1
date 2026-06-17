$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.207.ps1") { Remove-Item -LiteralPath "push_v3.74.207.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.208"') {
    Write-Host "+ 3.74.208" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$mig = Get-Content -LiteralPath "supabase/migrations/20260617000208_v3_74_208_allow_companion_paid_fields.sql" -Raw
if ($mig -notmatch "'original_paid'") {
    Write-Host "X migration missing original_paid in allow-list" -ForegroundColor Red; exit 1
}
if ($mig -notmatch "'display_paid'") {
    Write-Host "X migration missing display_paid in allow-list" -ForegroundColor Red; exit 1
}
Write-Host "+ allow-list extended with FX companions" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_208.txt"
    $msgLines = @(
        "fix(invoice): v3.74.208 - allow original_paid + display_paid alongside paid_amount on partially-paid invoices",
        "",
        "Reported in Bulk Collection (/payments): trying to allocate 5 EGP to",
        "the partially-paid invoice INV-00005 failed with:",
        "  لا يمكن تعديل الفاتورة المدفوعة. الحقل المعدل: original_paid.",
        "",
        "Cause: prevent_paid_invoice_modification protects rows in status",
        "'paid' / 'partially_paid' from drift. Its allow-list included",
        "paid_amount but missed the two FX companion fields - original_paid",
        "(foreign-currency amount paid) and display_paid (display-currency",
        "amount paid). When a new payment is recorded the three columns are",
        "written together so paid_amount stays accurate in every currency",
        "view, but the trigger flagged the update on original_paid as a",
        "modification attempt on a paid invoice and aborted the whole",
        "transaction.",
        "",
        "Fix: original_paid and display_paid added to the allow-list. They",
        "are derived projections of paid_amount in the invoice's FC and the",
        "user's display currency, so they have to track together. The other",
        "FC totals (original_total / display_total / original_subtotal /",
        "original_tax_amount) stay protected - those describe what the",
        "customer was billed for, not what they have paid, and must not",
        "shift after the invoice is partially paid.",
        "",
        "  supabase/migrations/20260617000208_v3_74_208_allow_companion_paid_fields.sql",
        "  lib/version.ts -> 3.74.208"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.208 pushed" -ForegroundColor Green
}
