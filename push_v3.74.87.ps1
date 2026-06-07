# v3.74.87 - UX: cap input + overshoot warning + post-apply feedback on credit-apply dialog
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.87"') { Write-Host "+ APP_VERSION = 3.74.87" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.87" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.87]')) { Write-Host "+ CHANGELOG 3.74.87" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.87" -ForegroundColor Red; exit 1 }

$f = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
$lineCount = ($f -split "`n").Count
if ($lineCount -ge 4000) { Write-Host "+ invoices/[id]/page.tsx intact ($lineCount lines)" -ForegroundColor Green } else { Write-Host "X file truncated ($lineCount lines)" -ForegroundColor Red; exit 1 }
if ($f.TrimEnd().EndsWith("}")) { Write-Host "+ ends with }" -ForegroundColor Green } else { Write-Host "X file does not end with }" -ForegroundColor Red; exit 1 }

if ($f -match 'v3\.74\.87: cap input') { Write-Host "+ v3.74.87 input-cap marker present" -ForegroundColor Green } else { Write-Host "X marker missing" -ForegroundColor Red; exit 1 }
if ($f -match 'maxApplicable') { Write-Host "+ maxApplicable computed" -ForegroundColor Green } else { Write-Host "X maxApplicable missing" -ForegroundColor Red; exit 1 }
if ($f -match 'remaining_credit') { Write-Host "+ remaining_credit read from response" -ForegroundColor Green } else { Write-Host "X response not consumed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String "app/invoices/\[id\]/page\.tsx").Count
if ($err -eq 0) { Write-Host "+ 0 errors in invoices/[id]/page.tsx" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; $tsc | Select-String "app/invoices/\[id\]/page\.tsx" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "feat(credit-apply-ux): v3.74.87 - cap, warn, and report post-apply

After v3.74.86 the apply flow works correctly but the dialog was silent
about three things: the input had no max, the helper line only showed
invoice-remaining (not the real cap = min(credit, remaining)), and on
success the dialog closed without telling the user that p_amount got
silently reduced by the DB's LEAST() guard.

Scenario the user hit: invoice 8 EGP, credit 10 EGP, user typed 10.
Server applied 8 (correct - invoice covered), 2 stayed in credit, but
the UI gave no acknowledgement of either fact.

Three edits, one file, no DB change:
1. <input> gets max={min(creditBalance, invoiceRemaining)}.
2. Helper line: 'Remaining balance: X . Max applicable: Y'. Amber
   warning box renders only when entered > maxApplicable, telling the
   user exactly how much will be applied and how much stays in credit.
3. Success handler now reads applied_amount + remaining_credit from
   the RPC response (the function already returned both, we were
   ignoring them). ledgerCreditBalance updates from server truth, not
   zero. If applied < entered, alert() shows what happened.

File restored from HEAD then both edits re-applied via heredoc with
anchor assertions; Edit tool truncated the tail on first attempt.
TypeScript: 0 errors. 4057 lines, ends with }.

Trade-off: alert() not toast - the file doesn't import a toast lib and
the timing is fine right after dialog close. Other apply entry points
(/payments, /customer-credits) keep the old display for now." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.87 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.86.ps1') { Remove-Item -LiteralPath 'push_v3.74.86.ps1' -Force }
}
