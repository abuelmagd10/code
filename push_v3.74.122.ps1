$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
foreach ($old in @("push_v3.74.116.ps1","push_v3.74.117.ps1","push_v3.74.118.ps1","push_v3.74.119.ps1","push_v3.74.120.ps1","push_v3.74.121.ps1")) {
  if (Test-Path $old) { Remove-Item -LiteralPath $old -Force }
}

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.122"') { Write-Host "+ 3.74.122" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(payments): v3.74.122 - trace VOID rows back to their source

User pointed out that the customer side of /payments should never
fall back to 'Not linked' - every customer-side payment originates
from some invoice or credit event, and the column should make that
trail visible. A VOID created by payment correction was showing
'Not linked' because the void inherits invoice_id=NULL from a
credit-refund original (which has no invoice tie either - it's
sourced from a sales return).

The Linked-Invoice cell now classifies the row in this order:

  1. Direct invoice link        → link to that invoice (unchanged)
  2. voids_payment_id is set    → trace to the original payment:
        a) original had an invoice → 'تَصحيح دَفعَة على INV-N'
        b) original was a credit refund (negative, no invoice)
                                  → 'تَصحيح صَرف رَصيد دائن (من مَرتَجَع INV-N)'
        c) original not loaded   → 'تَصحيح دَفعَة' (generic)
  3. Negative amount, no invoice → 'صَرف رَصيد دائن (من مَرتَجَع INV-N)' (existing)
  4. Anything else              → 'غير مرتبط' (rare, with notes title)

Visual: VOID rows are amber-colored to distinguish from regular
blue-linked payments and purple credit-refund rows, so an auditor
can see at a glance which rows are corrections.

Also bundles the v3.74.121 fix (include partially_used credits in
the /customers available-balance calculation) and the DB-side
v3.74.117-120 hardening of execute_payment_correction." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.122 pushed" -ForegroundColor Green
}
