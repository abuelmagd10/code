# v3.55.3 — Hotfix: 403 على INSERT estimates (company_id missing)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$est = Get-Content "app\estimates\page.tsx" -Raw

if ($est -match "company_id: companyId") {
    Write-Host "  ✓ saveEstimate now includes company_id in payload" -ForegroundColor Green
} else {
    Write-Host "  ✗ company_id NOT added to payload" -ForegroundColor Red
    exit 1
}

if ($est -match "Required for RLS: company_id must be in payload") {
    Write-Host "  ✓ saveEstimate has RLS comment marker" -ForegroundColor Green
} else {
    Write-Host "  ✗ RLS comment missing" -ForegroundColor Red
    exit 1
}

if ($est -match "estimate\.company_id \|\| \(await getActiveCompanyId") {
    Write-Host "  ✓ convertToSO also gets company_id" -ForegroundColor Green
} else {
    Write-Host "  ✗ convertToSO did not get company_id fix" -ForegroundColor Red
    exit 1
}

if ($est -match 'console\.error\("Estimate insert error') {
    Write-Host "  ✓ Better error logging (console.error)" -ForegroundColor Green
} else {
    Write-Host "  ✗ Missing diagnostic logging" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript errors:" -ForegroundColor Red
    Write-Host ($tscOutput | Out-String)
    exit 1
}
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add app/estimates/page.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "fix(estimates): 403 Forbidden on insert - company_id missing from payload

Bug:
After creating the estimates table (v3.55.2), saving a new estimate
returned POST /rest/v1/estimates 403 (Forbidden) even for role=owner.

Root cause:
The payload sent to Supabase did NOT include company_id. The RLS
policy 'estimates_insert WITH CHECK can_modify_data(company_id)'
was evaluating against company_id = NULL, which always returns false
(no member match for NULL company).

Fix:
- saveEstimate(): call getActiveCompanyId(supabase) and add
  company_id: companyId to the payload
- convertToSO(): same fix for sales_orders payload (using
  estimate.company_id if available, else getActiveCompanyId)
- Better error reporting: console.error + show error.message
  instead of static text

Governance preserved:
- can_modify_data(company_id) now correctly returns true for
  owner/admin/manager/accountant/staff in the user's company
- Users not in the company cannot create estimates (RLS still blocks)" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ v3.55.3 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "🧪 After Vercel rebuild test:" -ForegroundColor Cyan
    Write-Host "  /estimates -> 'عرض جديد' -> اختر عميل + رقم + بَند + احفظ" -ForegroundColor White
    Write-Host "  -> يَجب أَن يَنجح بدون 403" -ForegroundColor White
    Write-Host "  -> العَرض يَظهر فى القائمة" -ForegroundColor White
    Write-Host "  -> اختبر 'تحويل لأمر بيع' أَيضاً" -ForegroundColor White
}
