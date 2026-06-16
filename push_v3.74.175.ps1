$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.174.ps1") { Remove-Item -LiteralPath "push_v3.74.174.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.175"') { Write-Host "+ 3.74.175" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/bills/page.tsx" -Raw
if ($page -notmatch "row.return_status === 'fully_returned'") {
    Write-Host "X return_status check not updated" -ForegroundColor Red
    exit 1
}
if ($page -match "row.return_status === 'full'") {
    Write-Host "X stale 'full' comparison still present" -ForegroundColor Red
    exit 1
}
if ($page -notmatch "billOpenVcMap") {
    Write-Host "X vendor-credit balance map not wired" -ForegroundColor Red
    exit 1
}
Write-Host "+ bills page fixes applied" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_175.txt"
    $msgLines = @(
        "fix(bills): v3.74.175 - bills list misrepresents fully-returned bill",
        "",
        "Tester report on BILL-0002 (5 units, all 5 returned):",
        "  - 'مرتجع كامل' button still showed in the actions column.",
        "  - Return badge said 'مرتجع جزئي' instead of 'مرتجع كامل'.",
        "  - '+5.00 سُلفَة' badge on Remaining, even though only 3 EGP is",
        "    actually sitting on the supplier ledger as an open vendor",
        "    credit - the other 2 EGP was paid back in cash by PRET-67525",
        "    and the vendor_credit row was already closed/removed.",
        "",
        "Three independent bugs in app/bills/page.tsx, all surfaced by the",
        "same row:",
        "",
        "Bug A: return badge compared against the wrong literal.",
        "  - Code: row.return_status === 'full' / 'partial'",
        "  - DB:   row.return_status IN ('fully_returned', 'partially_returned')",
        "  - The check never matched the 'full' branch, so any returned bill",
        "    fell through to 'مرتجع جزئي'. Fixed by comparing against",
        "    'fully_returned' and dropping the row.status !== guard which",
        "    was reading the payment-status column by mistake.",
        "",
        "Bug B: 'مرتجع كامل' / 'مرتجع جزئي' action buttons stayed visible.",
        "  - Old guard: row.status === 'fully_returned' (status is the",
        "    payment state - paid / partially_paid / sent / ... - it is",
        "    never the value 'fully_returned'). So the early return never",
        "    fired.",
        "  - New guard: explicit check on row.return_status === 'fully_returned'.",
        "  - Belt-and-suspenders: after computing returnableItems (items",
        "    whose max_qty > 0), bail out when the list is empty. Covers",
        "    the case where return_status lags the items.",
        "",
        "Bug C: '+سُلفَة' badge was sized from (paid - net_total).",
        "  - That formula counts cash-settled returns as still being a",
        "    credit, which is wrong: confirm_purchase_return_delivery_v2",
        "    closes those vendor_credits at warehouse approval (v3.74.173).",
        "  - Now: fetch total_amount, applied_amount, status alongside",
        "    bill_id; build a per-bill map of OPEN vendor_credit balance",
        "    (sum of total - applied for status='open'); render the badge",
        "    only when that balance is > 0 and label it with the actual",
        "    open amount.",
        "  - Tooltip updated from 'تم تحويل الزيادة لرصيد المورد' to",
        "    'إِشعار دائن مَفتوح لَم يُطَبَّق بَعد' to match the new semantics.",
        "",
        "Files:",
        "  app/bills/page.tsx",
        "    - billOpenVcMap state.",
        "    - vendor_credits SELECT extended with total_amount, applied_amount,",
        "      status. Loop accumulates per-bill open balance.",
        "    - return-badge format reads 'fully_returned' / 'partially_returned'.",
        "    - actions render-guard checks return_status and returnableItems.length.",
        "    - Remaining column renders openVcBalance, not paid - net_total.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.175.",
        "",
        "Out of scope (intentional):",
        "  - The 'المبلغ' column still subtracts returned_amount via",
        "    getDisplayAmount; this matches the older spec where the column",
        "    shows the net amount the supplier still owes us. Renaming the",
        "    header to 'الصافى' or showing the original + returned can be",
        "    a follow-up if Ahmed wants it - asked in the conversation."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.175 pushed" -ForegroundColor Green
}
