$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.106.ps1") { Remove-Item -LiteralPath "push_v3.74.106.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.107"') { Write-Host "+ 3.74.107" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(refund-requests): v3.74.107 - hide approve/reject from non-board + show reason

The requester used to see 'Approve' and 'Reject' buttons on their own
filing because /customer-refund-requests treated owner+admin+general_
manager+manager+accountant as a single privileged tier. After v3.74.105
restricted those endpoints to owner/general_manager only, the buttons
no longer matched the API. Tighten the UI so the visible controls match
who can actually act.

Reason column: was showing the machine slug ('payment_correction',
'delivery_rejection') with no human reason, so the approver had no
idea why the row was filed. Now we render the type as a short tag
plus the user-written notes (clamped to 2 lines with full text in
the tooltip)." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.107 pushed" -ForegroundColor Green
}
