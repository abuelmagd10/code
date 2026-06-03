# v3.51.0 — Phase 2 Batch 1: cost-centers + warehouses
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify ===" -ForegroundColor Cyan
$cc = Get-Content "app\cost-centers\page.tsx" -Raw
$wh = Get-Content "app\warehouses\page.tsx" -Raw
if ($cc -match "import.*ERPPageHeader") { Write-Host "  ✓ cost-centers imports ERPPageHeader" -ForegroundColor Green } else { Write-Host "  ✗" -ForegroundColor Red; exit 1 }
if ($cc -match "<ERPPageHeader") { Write-Host "  ✓ cost-centers renders ERPPageHeader" -ForegroundColor Green } else { Write-Host "  ✗" -ForegroundColor Red; exit 1 }
if ($cc -match "canWrite") { Write-Host "  ✓ cost-centers preserves canWrite" -ForegroundColor Green } else { Write-Host "  ✗" -ForegroundColor Red; exit 1 }
if ($wh -match "import.*ERPPageHeader") { Write-Host "  ✓ warehouses imports ERPPageHeader" -ForegroundColor Green } else { Write-Host "  ✗" -ForegroundColor Red; exit 1 }
if ($wh -match "<ERPPageHeader") { Write-Host "  ✓ warehouses renders ERPPageHeader" -ForegroundColor Green } else { Write-Host "  ✗" -ForegroundColor Red; exit 1 }
if ($wh -match "openCreateDialog") { Write-Host "  ✓ warehouses preserves openCreateDialog" -ForegroundColor Green } else { Write-Host "  ✗" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "TypeScript errors:" -ForegroundColor Red; Write-Host ($tscOutput | Out-String); exit 1 }
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add app/cost-centers/page.tsx app/warehouses/page.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(ui): v3.51.0 Phase 2 Batch 1 - ERPPageHeader on /cost-centers + /warehouses

Extends the successful Phase 2 pilot from /branches to two more CRUD pages.

app/cost-centers/page.tsx:
- Replaced custom header with <ERPPageHeader>
- canWrite + branches.length>0 conditions preserved on action button
- Governance notice (admin-only) preserved via extra prop

app/warehouses/page.tsx:
- Replaced CardHeader with <ERPPageHeader> outside the Card
- Branch-restricted notice for non-admin users preserved
- All CRUD logic untouched (openCreateDialog, openEditDialog, delete flow)

Deferred:
- /shareholders has a deeply nested Dialog wrapping the trigger button.
  Migration there requires lifting the Dialog state independently from
  the trigger. Will tackle in a focused commit.

Safety: zero functional changes, permission checks intact, Dialog/Form
flows untouched." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ v3.51.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "🧪 After Vercel rebuild test:" -ForegroundColor Cyan
    Write-Host "  /cost-centers → should show breadcrumbs + new header" -ForegroundColor White
    Write-Host "  /warehouses   → should show breadcrumbs + new header" -ForegroundColor White
    Write-Host "  /branches     → should still work (pilot from v3.50.0)" -ForegroundColor White
}
