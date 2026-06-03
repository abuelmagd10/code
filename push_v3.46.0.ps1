# v3.46.0 — DataTable Mobile Fix
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify ===" -ForegroundColor Cyan
$dt = Get-Content "components\DataTable.tsx" -Raw
$css = Get-Content "app\globals.css" -Raw
if ($dt -match "sm:min-w-\[640px\]") { Write-Host "  ✓ DataTable uses responsive min-w" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }
if ($css -match "\.table-wrapper") { Write-Host "  ✓ table-wrapper utility" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "TypeScript errors:" -ForegroundColor Red; Write-Host ($tscOutput | Out-String); exit 1 }
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add components/DataTable.tsx app/globals.css CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "fix(ui): v3.46.0 UI Phase 1 Step 7 - DataTable mobile fix

Fixes layout breaking on mobile (<640px) caused by hardcoded
min-w-[640px] on DataTable component.

components/DataTable.tsx:
- minWidth default: min-w-[640px] -> sm:min-w-[640px]
- Mobile: table shrinks to viewport (no horizontal scroll noise)
- Desktop: keeps 640px min-width for readability
- Wrapper -mx-3 sm:mx-0 px-3 sm:px-0 (full-bleed on mobile)
- Auto-converts legacy minWidth='min-w-[X]' -> 'sm:min-w-[X]'

app/globals.css:
- New .table-wrapper utility for tables NOT using DataTable component
- Same responsive behavior available as a CSS class

Impact:
- ~40 pages using DataTable now mobile-friendly
- Custom tables can opt-in via .table-wrapper class

Safety:
- Backwards compatible (existing minWidth prop values still work)
- Zero functional changes
- Tables on desktop look identical to before" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) { Write-Host "`n✅ v3.46.0 pushed" -ForegroundColor Green }
