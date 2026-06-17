$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.205.ps1") { Remove-Item -LiteralPath "push_v3.74.205.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.206"') {
    Write-Host "+ 3.74.206" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$page = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
if ($page -notmatch "paymentJeIds") {
    Write-Host "X invoice page missing the journal_entry dedupe" -ForegroundColor Red; exit 1
}
if ($page -notmatch "v3.74.206") {
    Write-Host "X v3.74.206 marker not present in invoice page" -ForegroundColor Red; exit 1
}
Write-Host "+ invoice page filters duplicate credit-applied rows" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_206.txt"
    $msgLines = @(
        "fix(invoice): v3.74.206 - stop double-listing credit applications in the payments table",
        "",
        "Symptom on INV-00005: the payments table showed 6 rows totalling",
        "14.00 EGP for three 5+1+1 credit applications worth 7.00 EGP. Each",
        "application was rendered twice.",
        "",
        "Cause: since v3.74.102 the apply_customer_credit_to_invoice RPC",
        "writes BOTH a row in `payments` (payment_method='customer_credit',",
        "so it surfaces on /payments alongside cash) AND a row in",
        "customer_credit_ledger (for the ledger view). The invoice page",
        "merges invoicePayments + creditApplications into the same table",
        "without deduplicating, so every new application appeared once on",
        "each side.",
        "",
        "Fix:",
        "  app/invoices/[id]/page.tsx",
        "    - When hydrating creditApplications, build the set of",
        "      journal_entry_id values that already appear on payment rows.",
        "    - Filter out any customer_credit_ledger entry whose JE id is",
        "      already there. Legacy pre-v3.74.102 entries (ledger only,",
        "      no payment row) still render through the second source.",
        "",
        "Data fix (one-off): INV-00005's invoice.paid_amount had drifted to",
        "8.00 EGP while the approved-payments sum was 7.00 EGP - a leftover",
        "from a pre-v3.74.205 failed run that bumped paid_amount before the",
        "matching payment row was created. Reconciled to 7.00 EGP with an",
        "audit_logs trace. The GL is unchanged.",
        "",
        "lib/version.ts -> 3.74.206."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.206 pushed" -ForegroundColor Green
}
