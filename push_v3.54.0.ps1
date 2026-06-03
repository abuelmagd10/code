# v3.54.0 — Phase 2 Batch 4: ERPPageHeader على 8 صفحات
# journal-entries + banking + payments + bills + inventory
# + inventory-transfers + fixed-assets + approvals
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan

$files = @(
  @{ path = "app\journal-entries\page.tsx";      name = "journal-entries";      keep = "permWrite" },
  @{ path = "app\banking\page.tsx";              name = "banking";              keep = "permWrite" },
  @{ path = "app\payments\page.tsx";             name = "payments";             keep = "userContext" },
  @{ path = "app\bills\page.tsx";                name = "bills";                keep = "userContext" },
  @{ path = "app\inventory\page.tsx";            name = "inventory";            keep = "isAdmin" },
  @{ path = "app\inventory-transfers\page.tsx";  name = "inventory-transfers";  keep = "canCreate" },
  @{ path = "app\fixed-assets\page.tsx";         name = "fixed-assets";         keep = "permPostDepreciation" },
  @{ path = "app\approvals\page.tsx";            name = "approvals";            keep = "totalPending" }
)

foreach ($f in $files) {
  $c = Get-Content $f.path -Raw
  if ($c -match "import.*ERPPageHeader") { Write-Host "  ✓ $($f.name) imports ERPPageHeader" -ForegroundColor Green } else { Write-Host "  ✗ $($f.name) import missing" -ForegroundColor Red; exit 1 }
  if ($c -match "<ERPPageHeader") { Write-Host "  ✓ $($f.name) renders ERPPageHeader" -ForegroundColor Green } else { Write-Host "  ✗ $($f.name) render missing" -ForegroundColor Red; exit 1 }
  if ($c -match $f.keep) { Write-Host "  ✓ $($f.name) preserves $($f.keep)" -ForegroundColor Green } else { Write-Host "  ✗ $($f.name) $($f.keep) missing" -ForegroundColor Red; exit 1 }
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
git add app/journal-entries/page.tsx app/banking/page.tsx app/payments/page.tsx app/bills/page.tsx `
        app/inventory/page.tsx app/inventory-transfers/page.tsx app/fixed-assets/page.tsx app/approvals/page.tsx `
        CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(ui): v3.54.0 Phase 2 Batch 4 - ERPPageHeader on 8 accounting + inventory pages

Largest Phase 2 batch yet. 8 daily-use business pages migrated to unified header.

Pages:
- journal-entries: permWrite + governance + filter chip in extra
- banking: permWrite action + 👑/📍 role-based notice
- payments: governance + offline banner in extra
- bills: 'New Purchase Order' action + governance
- inventory: header separated from branch/warehouse filters (filters in own Card)
- inventory-transfers: canCreate + governance
- fixed-assets: 3 actions (Post Depreciation + Refresh + Add Asset) + governance
- approvals: pending count badge + refresh in actions

Safety:
- All permission checks (permWrite, canCreate, permPostDepreciation) preserved
- Branch + warehouse filter logic in inventory intact (visually separate, functionally connected)
- userContext, userRole, currentUserRole untouched everywhere
- All CRUD logic untouched
- useAccess + PageGuard unchanged" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ v3.54.0 pushed (8 pages migrated)" -ForegroundColor Green
    Write-Host ""
    Write-Host "🧪 After Vercel rebuild test ALL 8 pages:" -ForegroundColor Cyan
    Write-Host "  /journal-entries     → breadcrumbs + header + 'قيد جديد' (if admin)" -ForegroundColor White
    Write-Host "  /banking             → breadcrumbs + header + 'إضافة حساب' (if admin)" -ForegroundColor White
    Write-Host "  /payments            → breadcrumbs + header + governance + offline banner" -ForegroundColor White
    Write-Host "  /bills               → breadcrumbs + header + 'أمر شراء جديد'" -ForegroundColor White
    Write-Host "  /inventory           → breadcrumbs + header + branch/warehouse filters in own Card" -ForegroundColor White
    Write-Host "  /inventory-transfers → breadcrumbs + header + 'طلب نقل جديد' (if canCreate)" -ForegroundColor White
    Write-Host "  /fixed-assets        → breadcrumbs + header + 3 actions" -ForegroundColor White
    Write-Host "  /approvals           → breadcrumbs + header + pending badge + refresh" -ForegroundColor White
    Write-Host ""
    Write-Host "🔍 CRITICAL regression tests:" -ForegroundColor Yellow
    Write-Host "  - Inventory: branch + warehouse selectors still work" -ForegroundColor White
    Write-Host "  - Fixed-assets: Post Depreciation button still works" -ForegroundColor White
    Write-Host "  - Approvals: Refresh + tabs still work" -ForegroundColor White
}
