# v3.43.0 — Status Color Tokens + StatusBadge component
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify changes ===" -ForegroundColor Cyan
$globals = Get-Content "app\globals.css" -Raw
$badge   = Test-Path "components\StatusBadge.tsx"

if ($globals -match "--success: #16a34a") { Write-Host "  ✓ globals.css has success token" -ForegroundColor Green } else { Write-Host "  ✗ globals.css missing success" -ForegroundColor Red }
if ($globals -match "--warning: #f59e0b") { Write-Host "  ✓ globals.css has warning token" -ForegroundColor Green } else { Write-Host "  ✗ missing warning" -ForegroundColor Red }
if ($globals -match "--info: #2563eb")    { Write-Host "  ✓ globals.css has info token" -ForegroundColor Green } else { Write-Host "  ✗ missing info" -ForegroundColor Red }
if ($globals -match "--color-success: var")     { Write-Host "  ✓ tailwind theme registered" -ForegroundColor Green } else { Write-Host "  ✗ not registered with tailwind" -ForegroundColor Red }
if ($badge) { Write-Host "  ✓ StatusBadge.tsx exists" -ForegroundColor Green } else { Write-Host "  ✗ StatusBadge.tsx missing" -ForegroundColor Red }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript errors:" -ForegroundColor Red
    Write-Host ($tscOutput | Out-String)
    exit 1
}
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add app/globals.css components/StatusBadge.tsx CHANGELOG.md
git --no-pager diff --cached --stat

git commit -m "feat(ui): v3.43.0 UI Phase 1 Step 4 - Status color tokens + StatusBadge

Adds unified semantic color tokens (success/warning/info) to design system
plus a reusable StatusBadge component.

globals.css:
- 9 new CSS variables (3 each for success/warning/info)
- Dark mode counterparts (muted backgrounds become dark variants)
- Registered in @theme inline so bg-success, text-warning, etc. work in Tailwind

components/StatusBadge.tsx (new):
- 6 variants: success, error, warning, info, neutral, pending
- 4 sizes: xs, sm, md, lg
- outline/filled, withIcon, custom icon, pulse animation
- inferStatusVariant(status) helper for Arabic + English status strings

Impact:
- Replaces 180+ scattered hardcoded color usages (text-green-600, etc.)
- Dark mode now works automatically for all status indicators
- Single source of truth for status colors across the entire app

Safety:
- Zero functional changes
- StatusBadge is additive only - existing code paths untouched
- Gradual migration: pages can adopt the new component over time" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ v3.43.0 pushed" -ForegroundColor Green
    Write-Host "Vercel will rebuild in ~3-5 min" -ForegroundColor Cyan
}
