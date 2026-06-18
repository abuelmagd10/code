$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.220.ps1") { Remove-Item -LiteralPath "push_v3.74.220.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.221"') {
    Write-Host "+ 3.74.221" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$cust = Get-Content -LiteralPath "components/customers/customer-refund-dialog.tsx" -Raw
if ($cust -notmatch 'type="number"[\s\S]{0,80}step="0\.01"[\s\S]{0,80}value=\{refundAmount\}') {
    Write-Host "X customer refund dialog amount field still rejects decimals" -ForegroundColor Red; exit 1
}
Write-Host "+ customer refund dialog accepts decimals" -ForegroundColor Green

$voucher = Get-Content -LiteralPath "components/customers/customer-voucher-dialog.tsx" -Raw
if ($voucher -notmatch 'step="0\.01"') {
    Write-Host "X customer voucher dialog amount field still rejects decimals" -ForegroundColor Red; exit 1
}
Write-Host "+ customer voucher dialog accepts decimals" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_221.txt"
    $msgLines = @(
        "fix(forms): v3.74.221 - decimal amounts accepted on monetary <Input type=number> fields",
        "",
        "Reported: customer credit refund dialog rejected fractional refund",
        "amounts (e.g. 2.50). Browser default step on <input type=number> is 1,",
        "so without an explicit step=0.01 the field silently refuses decimals.",
        "",
        "Fixed the reported field plus the parallel monetary fields surfaced",
        "by a codebase audit:",
        "",
        "  components/customers/customer-refund-dialog.tsx",
        "    - refund amount: step=0.01, min=0, inputMode=decimal",
        "  components/customers/customer-voucher-dialog.tsx",
        "    - voucher amount: same",
        "  app/sales-orders/page.tsx (items table)",
        "    - quantity: step=0.0001 (some items priced per fractional unit)",
        "    - unit_price: step=0.01",
        "    - discount_percent: step=0.01, min=0, max=100",
        "    - tax_rate: step=0.01, min=0, max=100",
        "    - total tax override: step=0.01",
        "  app/hr/employees/page.tsx",
        "    - base_salary (add + inline edit): step=0.01",
        "  app/hr/payroll/page.tsx",
        "    - adjustments row (allowances/deductions/bonuses/advances/insurance):",
        "      step=0.01 on all five",
        "    - slip edit row (base_salary/allowances/bonuses/advances/insurance/",
        "      deductions): step=0.01 on all six",
        "    - payment row amount: step=0.01",
        "",
        "Pattern: inputMode=decimal also surfaces the decimal keypad on mobile.",
        "Integer-only fields (page limits, year, top-N count, attendance grace",
        "minutes) intentionally left as-is so the spinner snaps to whole",
        "numbers there.",
        "",
        "  lib/version.ts -> 3.74.221"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.221 pushed" -ForegroundColor Green
}
