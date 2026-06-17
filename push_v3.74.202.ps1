$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.201.ps1") { Remove-Item -LiteralPath "push_v3.74.201.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.202"') {
    Write-Host "+ 3.74.202" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$page = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
# Both banners must now appear inside the Record-Payment dialog markup.
# Search for the apply-credit hook AFTER the dialog opens (IndexOf with
# a startIndex), not anywhere in the file — the original outer banner has
# its own copy earlier in the file.
$dialogStart = $page.IndexOf("Record payment for invoice")
if ($dialogStart -lt 0) {
    Write-Host "X payment dialog title not found" -ForegroundColor Red
    exit 1
}
$applyHookInsideDialog = $page.IndexOf("setShowApplyCreditDialog(true)", $dialogStart)
if ($applyHookInsideDialog -lt 0) {
    Write-Host "X payment dialog does not contain the apply-credit hook" -ForegroundColor Red
    exit 1
}
$markerInsideDialog = $page.IndexOf("v3.74.202", $dialogStart)
if ($markerInsideDialog -lt 0) {
    Write-Host "X v3.74.202 marker not inside the payment dialog" -ForegroundColor Red
    exit 1
}
Write-Host "+ credit banners wired inside the payment dialog" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_202.txt"
    $msgLines = @(
        "feat(invoice): v3.74.202 - customer-credit banners inside the Record-Payment dialog",
        "",
        "Before: the customer-credit banners (Disbursed Customer Credit and the",
        "available-credit Apply Credit panel) only existed on the invoice page",
        "itself. Once the user opened the Record Payment dialog they could not",
        "see what credit was available, and had to close the dialog, scroll up,",
        "find the panel, click Apply Credit, then come back. Surfaced by the user.",
        "",
        "Fix:",
        "  app/invoices/[id]/page.tsx",
        "    - Mirrors both panels at the top of the Record Payment dialog body,",
        "      gated by the same conditions (customerCreditDisbursed > 0 for the",
        "      reference panel; ledgerCreditBalance + status + canSeeCreditRefundButton",
        "      for the available-credit panel).",
        "    - Apply Credit button reuses the existing setShowApplyCreditDialog +",
        "      setCreditApplyAmount flow - same dialog, same /api/customer-credits/.../apply",
        "      endpoint, no business-logic duplication.",
        "    - 'Ledger' link points to /customer-credits/[customer_id] like the outer banner.",
        "",
        "  lib/version.ts -> 3.74.202."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.202 pushed" -ForegroundColor Green
}
