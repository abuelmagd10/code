$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.115.ps1") { Remove-Item -LiteralPath "push_v3.74.115.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.116"') { Write-Host "+ 3.74.116" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(refund-requests): v3.74.116 hotfix - execute 404 due to non-existent columns

User report: clicking Execute on an approved refund request returns
404 'Refund request not found' even though the row exists and the
requester is a company member.

Root cause: the SELECT in /api/customer-refund-requests/[id]/execute
listed 'branch_id' and 'cost_center_id' columns that DO NOT exist on
customer_refund_requests. PostgREST 400s the query, and the route only
checked '!refundReq' (data, not error) so the failure surfaced as a
404 instead of the underlying schema error.

Fix:
  - drop branch_id / cost_center_id from the explicit column list,
    add invoice_id and ask the joined invoice for branch_id instead.
  - capture the select error and return 500 with the real message,
    so the next schema mismatch isn't silently masked as 404.
  - downstream notification recipients now use the invoice's
    branch_id for branch-scoped delivery.

Affected: only the execute path. approve still uses '*'." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.116 pushed" -ForegroundColor Green
}
