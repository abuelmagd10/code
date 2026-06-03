# v3.47.0 — Touch Targets Upgrade (WCAG 2.5.5)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify ===" -ForegroundColor Cyan
$css = Get-Content "app\globals.css" -Raw
if ($css -match "touch-action: manipulation") { Write-Host "  ✓ touch-action present" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }
if ($css -match "-webkit-tap-highlight-color: transparent") { Write-Host "  ✓ tap-highlight present" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }
if ($css -match "\.tap-target ") { Write-Host "  ✓ tap-target utility" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }
if ($css -match "\.tap-target-sm") { Write-Host "  ✓ tap-target-sm utility" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "TypeScript errors:" -ForegroundColor Red; Write-Host ($tscOutput | Out-String); exit 1 }
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add app/globals.css CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(ui): v3.47.0 UI Phase 1 Step 8 - Touch Targets Upgrade (WCAG 2.5.5)

Enhancements to mobile touch interaction:
- touch-action: manipulation removes 300ms double-tap-to-zoom delay
- -webkit-tap-highlight-color: transparent removes iOS blue flash
- Both apply to existing 44px min target rule (no behavior change to layout)

New utility classes for explicit control:
- .tap-target     -> 44x44 (WCAG AAA standard)
- .tap-target-sm  -> 36x36 (secondary actions, table-row icons)
- .tap-target-none -> opt-out (for custom-layout cells)

Safety:
- No layout shifts (sizes unchanged)
- Desktop unaffected (max-width: 768px only)
- Zero functional changes" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) { Write-Host "`n✅ v3.47.0 pushed" -ForegroundColor Green }
