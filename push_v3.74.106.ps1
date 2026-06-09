$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.105.ps1") { Remove-Item -LiteralPath "push_v3.74.105.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.106"') { Write-Host "+ 3.74.106" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(notifications): v3.74.106 - route customer_refund_request

The payment correction workflow notifies the owner, the general
manager, and the requester with reference_type='customer_refund_request'.
NotificationCenter's deep-link map didn't carry that key, so clicking
any of those notifications showed 'Cannot navigate to this notification'.

Add the entry to lib/notification-routing.ts pointing to
/customer-refund-requests?highlight={id}, which is the page that
already lists the workflow rows with approve/reject/execute actions
(and respects role-based filtering)." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.106 pushed" -ForegroundColor Green
}
