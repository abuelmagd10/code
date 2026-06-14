$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.153.ps1") { Remove-Item -LiteralPath "push_v3.74.153.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.154"') { Write-Host "+ 3.74.154" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_154.txt"
    $msgLines = @(
        "fix(bills): v3.74.154 - sync display_/original_ totals on bill edit",
        "",
        "User report: BILL-0002 showed amount=4.00 EGP on the bills list",
        "but the supplier ledger showed outstanding=2.00 EGP after a 3.00",
        "partial payment. Math doesn't work either way until you realise",
        "the two screens are reading different columns.",
        "",
        "Investigation:",
        "  - bill_items: 5 units x 1 EGP = 5.00 (truth)",
        "  - bills.total_amount: 5.00 (used by GL + suppliers ledger)",
        "  - bills.subtotal: 5.00",
        "  - bills.display_total: 4.00 (stale - what the list shows)",
        "  - bills.display_subtotal: 4.00 (stale)",
        "  - bills.original_total: 4.00 (stale)",
        "  - bills.original_subtotal: 4.00 (stale)",
        "  - currency_code = EGP, exchange_rate = 1.00",
        "",
        "Root cause: app/bills/[id]/edit/page.tsx updates total_amount,",
        "subtotal and tax_amount when the user edits a bill but never",
        "touches the display_/original_ snapshot columns. Those columns",
        "are written at creation time and assumed to mirror the canonical",
        "totals; once items are re-entered they drift. The bills list",
        "uses display_total when display_currency matches the app's",
        "current currency - which is the common case - so the list",
        "shows yesterday's total while the ledger uses today's.",
        "",
        "Fix:",
        "  app/bills/[id]/edit/page.tsx",
        "    - The bills.update payload now sets display_total,",
        "      display_subtotal, original_total and original_subtotal to",
        "      the freshly computed totals.total/totals.subtotal alongside",
        "      total_amount and subtotal, so every snapshot column moves",
        "      together.",
        "    - Comment explains the intent for future readers.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.154.",
        "",
        "DB cleanup (run already, not in this commit):",
        "    UPDATE public.bills",
        "    SET display_total = total_amount,",
        "        display_subtotal = subtotal,",
        "        original_total = total_amount,",
        "        original_subtotal = subtotal",
        "    WHERE id = '33b79d9d-234d-4505-b2be-02bbd9d3f6ab' (BILL-0002);",
        "  Verified zero other bills in this company carry the drift.",
        "",
        "Followups (not in this commit):",
        "  - The same edit pattern likely exists for invoices, sales-orders",
        "    and purchase-orders. Audit those forms for the equivalent",
        "    display_/original_ column drift.",
        "  - Consider a DB trigger that keeps these columns aligned when",
        "    total_amount is updated, so a future code path that misses",
        "    them doesn't reintroduce the bug."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.154 pushed" -ForegroundColor Green
}
