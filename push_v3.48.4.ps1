# v3.48.4 — Fix grouped useMemo missing visibleCommands dependency
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify ===" -ForegroundColor Cyan
$cmdk = Get-Content "components\CommandPalette.tsx" -Raw
if ($cmdk -match "\[lang, visibleCommands\]") { Write-Host "  ✓ grouped useMemo has visibleCommands dep" -ForegroundColor Green } else { Write-Host "  ✗ missing dependency" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "TypeScript errors:" -ForegroundColor Red; Write-Host ($tscOutput | Out-String); exit 1 }
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add components/CommandPalette.tsx
git --no-pager diff --cached --stat
git commit -m "fix(security): v3.48.4 - grouped useMemo missing visibleCommands dependency

ROOT CAUSE of the 'palette shows only 2 items' bug discovered via
debug logging at runtime: the grouped useMemo had dependency [lang]
only, so when visibleCommands transitioned from the fail-closed
initial value (3 items: dashboard, dashboard, profile) to the
permission-filtered list (89 for owner, ~20 for accountant), the
grouped Map was never recomputed.

The render reads from grouped, so the DOM stayed pinned to the
3-item initial snapshot forever.

Debug capture proved this:
  visible_commands: 89  (state was correct)
  totalItems in DOM: 3  (render was stale)

Fix: add visibleCommands to the dependency array.

This is the bug the user reported: 'لم يظهر لجميع المستخدمين عند
استخدام alt+k الا صفحتين وهم لوحة التحكم و الملف الشخصى'." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) { Write-Host "`n✅ v3.48.4 pushed" -ForegroundColor Green }
