# Fix incomplete sidebar.tsx + push v3.42.2
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify sidebar.tsx fix ===" -ForegroundColor Cyan
$sidebarContent = Get-Content "components\sidebar.tsx" -Raw

$checks = @{
    "approvals_NOT_top_level" = -not ($sidebarContent -match "key: 'approvals'")
    "estimates_in_sales"      = $sidebarContent -match "Estimates.*?/estimates"
    "services_after_sales"    = ($sidebarContent.IndexOf("key: 'services_bookings'") -lt $sidebarContent.IndexOf("key: 'purchases'"))
    "approvals_under_mfg"     = $sidebarContent -match "Approval Inbox.*?/approvals"
    "mrp_in_mfg"              = $sidebarContent -match "manufacturing/mrp"
    "work_centers_in_mfg"     = $sidebarContent -match "manufacturing/work-centers"
    "Cpu_import"              = $sidebarContent -match "Cpu,"
    "accounting_periods"      = $sidebarContent -match "/accounting/periods"
}

$allPass = $true
foreach ($k in $checks.Keys) {
    $v = $checks[$k]
    if ($v) { Write-Host "  ✓ $k" -ForegroundColor Green } else { Write-Host "  ✗ $k" -ForegroundColor Red; $allPass = $false }
}

if (-not $allPass) {
    Write-Host "`nERROR: Some checks failed. Aborting." -ForegroundColor Red
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
git add components/sidebar.tsx
git --no-pager diff --cached --stat
git commit -m "fix(ui): v3.42.2 - complete sidebar reorganization

Previous v3.42.x commits only partially synced sidebar.tsx due to
sandbox/Windows file sync issues. The deployed version still had:
- Approvals as top-level (should be under Manufacturing)
- Services & Bookings after Inventory (should be after Sales)
- Missing /estimates, /manufacturing/mrp, /manufacturing/work-centers
- Missing /accounting/periods

This commit completes all the original v3.42.0 sidebar changes." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ v3.42.2 pushed successfully" -ForegroundColor Green
    Write-Host "Vercel will rebuild in ~3-5 min, then test on 7esab.com" -ForegroundColor Cyan
}
