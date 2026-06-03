# v3.50.0 — Phase 2 Pilot: ERPPageHeader Migration on /branches
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify ===" -ForegroundColor Cyan
$br = Get-Content "app\branches\page.tsx" -Raw
if ($br -match "import.*ERPPageHeader") { Write-Host "  ✓ ERPPageHeader imported" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }
if ($br -match "<ERPPageHeader") { Write-Host "  ✓ ERPPageHeader rendered" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }
if ($br -match "canWrite") { Write-Host "  ✓ canWrite check preserved" -ForegroundColor Green } else { Write-Host "  ✗ permission check missing" -ForegroundColor Red; exit 1 }
if ($br -match "openNewDialog") { Write-Host "  ✓ openNewDialog action preserved" -ForegroundColor Green } else { Write-Host "  ✗ action missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "TypeScript errors:" -ForegroundColor Red; Write-Host ($tscOutput | Out-String); exit 1 }
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add app/branches/page.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(ui): v3.50.0 Phase 2 Pilot - ERPPageHeader migration (/branches)

First page migrated in the Phase 2 Migration Wave.

app/branches/page.tsx:
- Replaced custom header div with <ERPPageHeader />
- Page now automatically gets:
  * Breadcrumbs trail (Home > Branches)
  * Unified typography (heading sizes, spacing)
  * Consistent responsive behavior
- 'New Branch' button preserved via 'actions' prop
- Admin governance notice preserved via 'extra' prop
- canWrite permission check preserved
- All CRUD logic untouched

Safety: zero functional changes. No PageGuard modifications.
No data-fetching or permission changes.

If this pilot works well in production, the same approach will
migrate /cost-centers, /warehouses, /customers next, then the
remaining ~180 pages in safe batches." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ v3.50.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "🧪 BEFORE PROCEEDING TO MORE PAGES:" -ForegroundColor Yellow
    Write-Host "  Test /branches on 7esab.com thoroughly:" -ForegroundColor Yellow
    Write-Host "    ✓ Header looks correct (with Breadcrumbs)" -ForegroundColor White
    Write-Host "    ✓ 'New Branch' button visible (if admin)" -ForegroundColor White
    Write-Host "    ✓ Clicking 'New Branch' opens dialog" -ForegroundColor White
    Write-Host "    ✓ Branch CRUD (create/edit/delete) still works" -ForegroundColor White
    Write-Host "    ✓ Admin governance notice still visible" -ForegroundColor White
    Write-Host "    ✓ Non-admin user does NOT see 'New Branch'" -ForegroundColor White
}
