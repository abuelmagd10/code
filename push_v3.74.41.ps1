# v3.74.41 - hotfix: branch-scoped chart_of_accounts query in customers page
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.41"') {
    Write-Host "+ APP_VERSION = 3.74.41" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.41" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.41]')) {
    Write-Host "+ CHANGELOG 3.74.41" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.41" -ForegroundColor Red; exit 1 }

$cust = Get-Content -LiteralPath "app/customers/page.tsx" -Raw
if ($cust -match 'v3\.74\.41:\s*scope the disbursement-account picker correctly') {
    Write-Host "+ scope marker in customers page" -ForegroundColor Green
} else { Write-Host "X v3.74.41 scope marker missing in customers/page.tsx" -ForegroundColor Red; exit 1 }
if ($cust -match 'accountsPrivilegedRoles\s*=\s*\[''owner'',\s*''admin'',\s*''general_manager''\]') {
    Write-Host "+ privileged roles list correct" -ForegroundColor Green
} else { Write-Host "X privileged roles list missing" -ForegroundColor Red; exit 1 }
if ($cust -match '\.in\("sub_type",\s*\["cash",\s*"bank"\]\)') {
    Write-Host "+ cash/bank sub_type narrowing applied" -ForegroundColor Green
} else { Write-Host "X cash/bank narrowing missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(customers): v3.74.41 - scope + narrow chart_of_accounts dropdown

The customer-refund dialog on /customers was fed by a chart_of_accounts
query that (a) had no branch filter and (b) listed every asset account,
not just cash/bank. v3.74.35 had fixed the parallel endpoint at
/api/customer-refund-requests/accounts, but this page was a different
code path - the branch accountant kept seeing every asset account in
the company.

Two-part fix:
1. Branch scope: privileged roles (owner, admin, general_manager) see
   all cash + bank accounts; everyone else gets only company-level
   accounts (branch_id NULL) + their own branch's accounts.
2. Narrow to cash + bank sub-types only. Receivables, inventory and
   fixed-asset accounts were never valid choices for a cash
   disbursement anyway.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.41 pushed" -ForegroundColor Green
}
