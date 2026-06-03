# v3.53.0 — Phase 2 Batch 3: ERPPageHeader على 4 صفحات
# drawings + customer-credits + vendor-credits + expenses
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan

$files = @(
  @{ path = "app\drawings\page.tsx";          name = "drawings" },
  @{ path = "app\customer-credits\page.tsx";  name = "customer-credits" },
  @{ path = "app\vendor-credits\page.tsx";    name = "vendor-credits" },
  @{ path = "app\expenses\page.tsx";          name = "expenses" }
)

foreach ($f in $files) {
  $c = Get-Content $f.path -Raw
  if ($c -match "import.*ERPPageHeader") { Write-Host "  ✓ $($f.name) imports ERPPageHeader" -ForegroundColor Green } else { Write-Host "  ✗ $($f.name) import missing" -ForegroundColor Red; exit 1 }
  if ($c -match "<ERPPageHeader") { Write-Host "  ✓ $($f.name) renders ERPPageHeader" -ForegroundColor Green } else { Write-Host "  ✗ $($f.name) render missing" -ForegroundColor Red; exit 1 }
  if ($c -match "PageHeaderList") { Write-Host "  ✗ $($f.name) still references PageHeaderList" -ForegroundColor Red; exit 1 } else { Write-Host "  ✓ $($f.name) no PageHeaderList residue" -ForegroundColor Green }
}

# Specific governance / permission checks
$exp = Get-Content "app\expenses\page.tsx" -Raw
if ($exp -match "canCreate") { Write-Host "  ✓ expenses preserves canCreate check" -ForegroundColor Green } else { Write-Host "  ✗ expenses canCreate missing" -ForegroundColor Red; exit 1 }

$vc = Get-Content "app\vendor-credits\page.tsx" -Raw
if ($vc -match "currentUserRole") { Write-Host "  ✓ vendor-credits preserves currentUserRole" -ForegroundColor Green } else { Write-Host "  ✗ vendor-credits currentUserRole missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript errors:" -ForegroundColor Red
    Write-Host ($tscOutput | Out-String)
    exit 1
}
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add app/drawings/page.tsx app/customer-credits/page.tsx app/vendor-credits/page.tsx app/expenses/page.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(ui): v3.53.0 Phase 2 Batch 3 - ERPPageHeader on 4 daily-use pages

Continues Phase 2 migration. Replaces legacy headers with unified ERPPageHeader
on 4 daily-use business pages.

app/drawings/page.tsx:
- Replaced <PageHeaderList> (legacy) with <ERPPageHeader>
- Link/Button for new drawing preserved

app/customer-credits/page.tsx:
- Replaced custom h1 header with <ERPPageHeader>
- No action button (display-only page)

app/vendor-credits/page.tsx:
- Replaced custom h1 header with <ERPPageHeader>
- New button preserved via actions prop
- Governance notice (branch/creator) moved to extra prop
- currentUserRole intact

app/expenses/page.tsx:
- Replaced <PageHeaderList governanceType=branch_creator> with <ERPPageHeader>
- canCreate check preserved (renders disabled Button when false)
- Governance notice (branch/creator) generated manually in extra prop
- currentUserRole intact

Safety:
- All CRUD logic untouched
- BranchFilter, useRealtimeTable intact
- useAccess, PageGuard untouched
- No data fetching changes" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ v3.53.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "🧪 After Vercel rebuild test:" -ForegroundColor Cyan
    Write-Host "  /drawings         → breadcrumbs + new header + 'تسجيل مسحوب' button" -ForegroundColor White
    Write-Host "  /customer-credits → breadcrumbs + new header (no action button)" -ForegroundColor White
    Write-Host "  /vendor-credits   → breadcrumbs + new header + 'جديد' + governance notice" -ForegroundColor White
    Write-Host "  /expenses         → breadcrumbs + new header + 'مصروف جديد' (disabled if no perm)" -ForegroundColor White
    Write-Host "  Test CRUD on each page" -ForegroundColor White
}
