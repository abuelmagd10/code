$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.181.ps1") { Remove-Item -LiteralPath "push_v3.74.181.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.182"') { Write-Host "+ 3.74.182" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$svc = Get-Content -LiteralPath "lib/services/customer-refund-command.service.ts" -Raw
if ($svc -match "reference_id: command\.invoiceId \|\| command\.customerId") {
    Write-Host "X service still uses customer_id as JE reference" -ForegroundColor Red
    exit 1
}
if ($svc -notmatch "reference_id: operationId") {
    Write-Host "X service does not use operationId as JE reference" -ForegroundColor Red
    exit 1
}
Write-Host "+ customer refund JE now references operationId (unique per refund)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_182.txt"
    $msgLines = @(
        "fix(customer-refund): v3.74.182 - DUPLICATE_JOURNAL_VIOLATION on second refund",
        "",
        "Tester report on the customer credit refund flow:",
        "  Branch accountant clicked refund on محمد بسيونى and got 500 from",
        "  /api/customers/refunds:",
        "    Error: DUPLICATE_JOURNAL_VIOLATION: A journal entry with",
        "      reference_type=[customer_credit_refund] and",
        "      reference_id=[3c38d6e1-...] already exists for company",
        "      [8ef6338c-...]. Duplicate accounting entries are not",
        "      permitted.",
        "",
        "Root cause:",
        "  lib/services/customer-refund-command.service.ts wrote the JE",
        "  with reference_id = command.invoiceId || command.customerId.",
        "  When the refund is not tied to a specific invoice (the common",
        "  'cash out the customer credit' case), customer_id was used.",
        "  The prevent_duplicate_journal_entry_v2 trigger then blocked",
        "  the second refund for the same customer forever, even though",
        "  each refund is a distinct accounting event.",
        "",
        "Fix:",
        "  lib/services/customer-refund-command.service.ts",
        "    - JE reference_id now uses operationId, the UUID this service",
        "      already mints per refund (also fed to the trace's sourceId",
        "      and the idempotency / request-hash inputs).",
        "    - That guarantees a fresh, unique reference per refund and",
        "      lets the same customer cash out as many times as their",
        "      credit balance allows.",
        "    - Both invoice-linked refunds and credit-only refunds share",
        "      the same reference_id source. The trace still carries",
        "      customer_id + invoice_id in metadata for lookups.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.182.",
        "",
        "How to verify:",
        "  - Sign in as the مدينة نصر branch accountant. Open /customers,",
        "    open محمد بسيونى (the customer the tester just tried), click",
        "    'صرف الرَّصيد' / 'Refund Credit'.",
        "  - Submit the refund. The 500 is gone, the JE is posted, and the",
        "    customer credit balance drops by the refunded amount.",
        "  - Submit a second refund (if there's still credit). It posts a",
        "    new JE with a fresh reference_id; no DUPLICATE_JOURNAL_VIOLATION.",
        "  - Older JEs that already used customer_id as reference_id stay",
        "    untouched (the change is forward-only).",
        "",
        "Out of scope:",
        "  - Historical JE row (4ad4cb...) for محمد بسيونى's June 9 refund",
        "    is fine as it is. We do not rewrite reference_id on past",
        "    refunds because that would break payment_allocations and",
        "    audit trails that already point at the customer_id."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.182 pushed" -ForegroundColor Green
}
