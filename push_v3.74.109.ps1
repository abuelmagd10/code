$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.108.ps1") { Remove-Item -LiteralPath "push_v3.74.108.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.109"') { Write-Host "+ 3.74.109" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green } else { Write-Host "X $err TS errors" -ForegroundColor Red; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(refund-requests): v3.74.109 - add UPDATE policy

customer_refund_requests had RLS policies for INSERT and SELECT only.
Approve/reject/execute routes already enforced an owner/general_manager
gate at the application layer, but the silent missing UPDATE policy
turned every status change into a no-op: the API would return success,
the notification would fire, the requester would refresh /customer-
refund-requests and still see the row stuck on 'pending'.

DB migration v3_74_109_refund_requests_update_policy adds an UPDATE
policy keyed on company_members.role IN ('owner','general_manager')
so the API can actually mutate the row. Same role list as the API
guards; both sides now match.

Backfilled the request that was just rejected so the requester sees
the correct cancelled state immediately." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.109 pushed" -ForegroundColor Green
}
