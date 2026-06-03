# v3.55.9 — Hotfix: Employee filter empty in /estimates (full_name column did not exist)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$est = Get-Content "app\estimates\page.tsx" -Raw

if ($est -match 'select\("user_id, role, email"\)') {
    Write-Host "  + Members query now selects user_id, role, email (not full_name)" -ForegroundColor Green
} else { Write-Host "  X Members query still uses old columns" -ForegroundColor Red; exit 1 }

if ($est -notmatch 'select\("user_id, full_name, email"\)') {
    Write-Host "  + Old full_name select removed" -ForegroundColor Green
} else { Write-Host "  X Old full_name select still there" -ForegroundColor Red; exit 1 }

if ($est -match "role\?: string") {
    Write-Host "  + Member type extended with role" -ForegroundColor Green
} else { Write-Host "  X Member type missing role" -ForegroundColor Red; exit 1 }

if ($est -match "\(m as any\)\.role") {
    Write-Host "  + Employee Select shows role label" -ForegroundColor Green
} else { Write-Host "  X Role label missing from Select" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript errors:" -ForegroundColor Red
    Write-Host ($tscOutput | Out-String)
    exit 1
}
Write-Host "+ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add app/estimates/page.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "fix(estimates): Employee filter dropdown was empty - column 'full_name' does not exist

Bug:
Owner/Admin/General_Manager were seeing an empty dropdown in the
'Employee creator' filter on /estimates.

Root cause:
company_members query selected 'full_name' but that column does not
exist in the table. Actual columns are: branch_id, company_id,
cost_center_id, created_at, currency_sync_enabled, email, employee_id,
id, invited_by, preferred_currency, role, seat_number, user_id,
warehouse_id. Supabase silently returned null, so the array was empty.

Fix (3 surgical sed-based edits to avoid Edit-tool issues with
template literals):
- Line 165: select('user_id, role, email')  (was 'user_id, full_name, email')
- Line 560: show '(role)' next to name/email in dropdown
- Line 23:  Member type adds role?: string

This is why previous attempts to fully align /estimates filters with
/sales-orders failed visually -- the filter was always empty so the
visual result never showed anything." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.55.9 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel rebuild:" -ForegroundColor Cyan
    Write-Host "  /estimates as owner/admin -> 'Employee creator' filter now shows all company members" -ForegroundColor White
    Write-Host "  Each member appears as: <email or user_id>  (role)" -ForegroundColor White
}
