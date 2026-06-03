# v3.55.15 - /estimates table styling aligned with DataTable pattern
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$est = Get-Content "app\estimates\page.tsx" -Raw

if ($est -match "bg-gray-50 dark:bg-slate-800") {
    Write-Host "  + thead has light background" -ForegroundColor Green
} else { Write-Host "  X thead background missing" -ForegroundColor Red; exit 1 }

if ($est -match "px-3 py-3 font-semibold text-gray-900 dark:text-white") {
    $cnt = ([regex]::Matches($est, "px-3 py-3 font-semibold text-gray-900 dark:text-white")).Count
    Write-Host ("  + " + $cnt + " <th> cells use unified padding + semibold") -ForegroundColor Green
} else { Write-Host "  X <th> padding/font missing" -ForegroundColor Red; exit 1 }

if ($est -match "hover:bg-gray-50 dark:hover:bg-slate-800/50") {
    Write-Host "  + rows have hover effect" -ForegroundColor Green
} else { Write-Host "  X row hover effect missing" -ForegroundColor Red; exit 1 }

if ($est -match "border-b border-gray-100 dark:border-gray-800") {
    Write-Host "  + rows have border-bottom matching DataTable" -ForegroundColor Green
} else { Write-Host "  X row border missing" -ForegroundColor Red; exit 1 }

if ($est -match "overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0") {
    Write-Host "  + responsive wrapper matches DataTable" -ForegroundColor Green
} else { Write-Host "  X wrapper classes wrong" -ForegroundColor Red; exit 1 }

if ($est -match "hidden sm:table-cell") {
    Write-Host "  + Date column hidden on mobile" -ForegroundColor Green
} else { Write-Host "  X Date column responsive class missing" -ForegroundColor Red; exit 1 }

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
git commit -m "style(estimates): align table header + cells with DataTable pattern

Estimates list table now matches the unified DataTable styling used
across other sales-module pages:

Thead:
- bg-gray-50 dark:bg-slate-800 background
- border-b, font-semibold, text-gray-900 dark:text-white
- px-3 py-3 padding on every <th>
- alignment per column type (right for numbers/text, center for badges)
- Date column hidden on mobile (hidden sm:table-cell)

Tbody:
- border-b border-gray-100 dark:border-gray-800 between rows
- hover:bg-gray-50 dark:hover:bg-slate-800/50 row highlight
- px-3 py-3 on every <td>
- Status now rendered as a neutral grey badge for visual consistency
- Date in lighter text-gray-600, Total in font-medium
- Wrapper: overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 (responsive)" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.55.15 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel rebuild:" -ForegroundColor Cyan
    Write-Host "  /estimates -> table now has unified DataTable look (header bg, padding, hover)" -ForegroundColor White
    Write-Host "  Compare with /sales-orders side by side -> identical visual style" -ForegroundColor White
}
