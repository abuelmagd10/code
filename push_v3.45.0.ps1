# v3.45.0 — Typography Hierarchy
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify ===" -ForegroundColor Cyan
$globals = Get-Content "app\globals.css" -Raw
if ($globals -match "Typography Hierarchy") { Write-Host "  ✓ typography section present" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }
if ($globals -match "\.heading-page") { Write-Host "  ✓ heading-page class" -ForegroundColor Green } else { Write-Host "  ✗ missing heading-page" -ForegroundColor Red; exit 1 }
if ($globals -match "\.text-body") { Write-Host "  ✓ text-body class" -ForegroundColor Green } else { Write-Host "  ✗ missing text-body" -ForegroundColor Red; exit 1 }
if ($globals -match ':where\(:not\(\[class\*="text-"\]\)\)') { Write-Host "  ✓ safe :where selector" -ForegroundColor Green } else { Write-Host "  ✗ missing safe selector" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "TypeScript errors:" -ForegroundColor Red; Write-Host ($tscOutput | Out-String); exit 1 }
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add app/globals.css CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(ui): v3.45.0 UI Phase 1 Step 6 - Typography Hierarchy

Adds semantic defaults for h1-h6 + 11 utility classes for consistent
typography across 209 pages.

globals.css @layer base:
- h1: text-2xl sm:text-3xl font-bold tracking-tight
- h2: text-xl sm:text-2xl font-semibold tracking-tight
- h3: text-lg sm:text-xl font-semibold
- h4: text-base sm:text-lg font-semibold
- h5: text-sm sm:text-base font-semibold
- h6: text-xs sm:text-sm font-semibold uppercase tracking-wider
- Protected by :where(:not([class*='text-'])) so Tailwind classes win

globals.css @layer components — 11 opt-in utilities:
- .heading-page / .heading-section / .heading-card / .heading-group
- .heading-eyebrow
- .text-body / .text-body-muted / .text-small / .text-caption
- .text-tabular / .text-code

Safety:
- :where() selector has specificity 0
- ANY existing Tailwind class wins automatically
- Zero visual impact on existing 209 pages
- New pages and future migrations use the new utilities" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) { Write-Host "`n✅ v3.45.0 pushed" -ForegroundColor Green }
