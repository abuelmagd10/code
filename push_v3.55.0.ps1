# v3.55.0 — Phase 2 Batch 5: 10 صفحات (إنهاء آمن Phase 2)
# Defers chart-of-accounts to Phase B (Dialog lifting)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan

$files = @(
  @{ path = "app\purchase-orders\page.tsx";          name = "purchase-orders";          keep = "permWrite" },
  @{ path = "app\purchase-returns\page.tsx";         name = "purchase-returns";         keep = "isStoreManager" },
  @{ path = "app\sales-returns\page.tsx";            name = "sales-returns";            keep = "permWrite" },
  @{ path = "app\sales-return-requests\page.tsx";    name = "sales-return-requests";    keep = "filterStatus" },
  @{ path = "app\sent-invoice-returns\page.tsx";     name = "sent-invoice-returns";     keep = "AlertTriangle" },
  @{ path = "app\customer-debit-notes\page.tsx";     name = "customer-debit-notes";     keep = "currentUserRole" },
  @{ path = "app\estimates\page.tsx";                name = "estimates";                keep = "onOpenNew" },
  @{ path = "app\annual-closing\page.tsx";           name = "annual-closing";           keep = "Annual Closing" },
  @{ path = "app\settings\page.tsx";                 name = "settings";                 keep = "language" },
  @{ path = "app\saas-admin\page.tsx";               name = "saas-admin";               keep = "totalCompanies" }
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
git add app/purchase-orders/page.tsx app/purchase-returns/page.tsx app/sales-returns/page.tsx `
        app/sales-return-requests/page.tsx app/sent-invoice-returns/page.tsx `
        app/customer-debit-notes/page.tsx app/estimates/page.tsx app/annual-closing/page.tsx `
        app/settings/page.tsx app/saas-admin/page.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(ui): v3.55.0 Phase 2 Batch 5 - ERPPageHeader on 10 pages (Phase 2 safe completion)

Final safe batch of Phase 2. 10 pages migrated, chart-of-accounts deferred.

Pages:
- purchase-orders: permWrite action + governance
- purchase-returns: store-manager pending count + governance + New Return
- sales-returns: permWrite + governance
- sales-return-requests: status filter dropdown in actions
- sent-invoice-returns: ADDED new header (was missing)
- customer-debit-notes: permWrite + governance
- estimates: onOpenNew action + admin governance
- annual-closing: simple header
- settings: language Badge + admin governance
- saas-admin: server component with ERPPageHeader client island

Deferred to Phase B (Dialog lifting):
- chart-of-accounts/ClientPage.tsx (nested Dialog with complex async onClick)
- shareholders, suppliers, products (from previous batches)

Safety:
- All permWrite checks preserved
- All governance notices (branch/creator/admin) preserved
- currentUserRole, userContext, isStoreManager all untouched
- All CRUD, Filters, Realtime untouched
- useAccess + PageGuard unchanged

Phase 2 milestone: 28 pages now use unified <ERPPageHeader>" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ v3.55.0 pushed (10 pages - Phase 2 safe completion!)" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎉 Phase 2 milestone: 28 total pages migrated to ERPPageHeader" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🧪 After Vercel rebuild test ALL 10 pages:" -ForegroundColor Cyan
    Write-Host "  /purchase-orders         → header + 'أمر جديد' (if permWrite)" -ForegroundColor White
    Write-Host "  /purchase-returns        → header + 'مرتجع جديد' + pending count" -ForegroundColor White
    Write-Host "  /sales-returns           → header + 'جديد' (if permWrite)" -ForegroundColor White
    Write-Host "  /sales-return-requests   → header + status filter" -ForegroundColor White
    Write-Host "  /sent-invoice-returns    → NEW header + warning card" -ForegroundColor White
    Write-Host "  /customer-debit-notes    → header + 'إشعار جديد'" -ForegroundColor White
    Write-Host "  /estimates               → header + 'عرض جديد'" -ForegroundColor White
    Write-Host "  /annual-closing          → simple header" -ForegroundColor White
    Write-Host "  /settings                → header + language Badge" -ForegroundColor White
    Write-Host "  /saas-admin              → server-rendered with client header" -ForegroundColor White
    Write-Host ""
    Write-Host "⏭️  Deferred for Phase B (Dialog lifting):" -ForegroundColor Yellow
    Write-Host "  /chart-of-accounts /shareholders /suppliers /products" -ForegroundColor White
}
