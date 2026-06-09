$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.107.ps1") { Remove-Item -LiteralPath "push_v3.74.107.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.108"') { Write-Host "+ 3.74.108" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(refund-requests): v3.74.108 - requester can see own requests

After v3.74.107 hid the approve/reject buttons from non-board members
the page also hid the table itself behind an Access Denied banner, so
a requester who clicked through their own notification saw nothing.

Split the gate in two:
- canAct (owner / general_manager) sees every row and the action
  buttons
- everyone else sees only the rows where requested_by matches their
  user id (no action buttons)

Counts at the top now reflect the visible slice so the pending/
approved/executed badges line up with what is rendered." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.108 pushed" -ForegroundColor Green
}
