# v3.42.3 — Add /hr to HR sidebar group + Command Palette
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify changes ===" -ForegroundColor Cyan
$sidebar = Get-Content "components\sidebar.tsx" -Raw
$cmdk = Get-Content "components\CommandPalette.tsx" -Raw

if ($sidebar -match "HR Home.*?/hr\$\{q\}") { Write-Host "  ✓ sidebar has HR Home" -ForegroundColor Green } else { Write-Host "  ✗ sidebar missing HR Home" -ForegroundColor Red }
if ($cmdk -match 'href: "/hr"') { Write-Host "  ✓ palette has /hr" -ForegroundColor Green } else { Write-Host "  ✗ palette missing /hr" -ForegroundColor Red }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "TypeScript errors:" -ForegroundColor Red; Write-Host ($tscOutput | Out-String); exit 1 }
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add components/sidebar.tsx components/CommandPalette.tsx
git --no-pager diff --cached --stat
git commit -m "feat(ui): v3.42.3 - add HR Home to sidebar and palette

Re-added /hr (the HR landing page) per user request:
- Sidebar: as first item in 'HR and Payroll' group
- Command Palette: as 'HR Home' / 'الموارد البشرية'

Previously removed because the landing page was considered redundant
with the existing sidebar group, but kept for users who want a single
HR entry point with dashboard cards." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) { Write-Host "`n✅ v3.42.3 pushed" -ForegroundColor Green }
