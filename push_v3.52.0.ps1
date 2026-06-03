# v3.52.0 — Phase 2 Batch 2: ERPPageHeader على /customers
# /services + /bookings already use ERPPageHeader (no work needed).
# /suppliers + /products deferred (nested Dialog pattern).
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$cu = Get-Content "app\customers\page.tsx" -Raw
if ($cu -match "import.*ERPPageHeader") { Write-Host "  ✓ customers imports ERPPageHeader" -ForegroundColor Green } else { Write-Host "  ✗ import missing" -ForegroundColor Red; exit 1 }
if ($cu -match "<ERPPageHeader") { Write-Host "  ✓ customers renders ERPPageHeader" -ForegroundColor Green } else { Write-Host "  ✗ render missing" -ForegroundColor Red; exit 1 }
if ($cu -match "CustomerFormDialog") { Write-Host "  ✓ customers preserves CustomerFormDialog" -ForegroundColor Green } else { Write-Host "  ✗ CustomerFormDialog missing" -ForegroundColor Red; exit 1 }
if ($cu -match "currentUserRole") { Write-Host "  ✓ customers preserves currentUserRole checks" -ForegroundColor Green } else { Write-Host "  ✗ governance check missing" -ForegroundColor Red; exit 1 }
if ($cu -match "BranchFilter") { Write-Host "  ✓ customers preserves BranchFilter" -ForegroundColor Green } else { Write-Host "  ✗ BranchFilter missing" -ForegroundColor Red; exit 1 }
if ($cu -match "loadCustomers") { Write-Host "  ✓ customers preserves loadCustomers" -ForegroundColor Green } else { Write-Host "  ✗ loadCustomers missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript errors:" -ForegroundColor Red
    Write-Host ($tscOutput | Out-String)
    exit 1
}
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add app/customers/page.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(ui): v3.52.0 Phase 2 Batch 2 - ERPPageHeader on /customers

Continues Phase 2 migration after Batch 1 (cost-centers + warehouses).

app/customers/page.tsx:
- Replaced custom header div with <ERPPageHeader variant=list>
- actions prop = <CustomerFormDialog> (composed component, self-contained state)
- extra prop = role-based governance notice:
  * manager/accountant -> branch-restricted notice
  * staff/sales/employee -> own-records-only notice

Scope check:
- /services already uses ERPPageHeader (no migration needed)
- /bookings already uses ERPPageHeader (no migration needed)
- /suppliers deferred: nested <Dialog> wrapping <DialogTrigger>+Button
  (same risky pattern as shareholders; requires Dialog state lifting)
- /products deferred: same nested Dialog pattern as suppliers

Safety:
- currentUserRole checks intact
- BranchFilter intact
- loadCustomers + CRUD untouched
- PageGuard + useAccess untouched
- CustomerFormDialog state (isDialogOpen, editingId) preserved" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ v3.52.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "🧪 After Vercel rebuild test:" -ForegroundColor Cyan
    Write-Host "  /customers → should show breadcrumbs + new header + governance notice" -ForegroundColor White
    Write-Host "  /services  → should still work (already had ERPPageHeader)" -ForegroundColor White
    Write-Host "  /bookings  → should still work (already had ERPPageHeader)" -ForegroundColor White
    Write-Host "  Test CRUD: New / Edit / Delete customer all still work" -ForegroundColor White
}
