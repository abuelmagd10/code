# v3.44.0 — Dark Mode Global Toggle
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify ===" -ForegroundColor Cyan
if (Test-Path "components\ThemeToggle.tsx") { Write-Host "  ✓ ThemeToggle.tsx exists" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }
$sidebar = Get-Content "components\sidebar.tsx" -Raw
if ($sidebar -match "import.*ThemeToggle") { Write-Host "  ✓ sidebar imports ThemeToggle" -ForegroundColor Green } else { Write-Host "  ✗ missing import" -ForegroundColor Red; exit 1 }
if ($sidebar -match "<ThemeToggle variant") { Write-Host "  ✓ sidebar renders ThemeToggle" -ForegroundColor Green } else { Write-Host "  ✗ missing render" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "TypeScript errors:" -ForegroundColor Red; Write-Host ($tscOutput | Out-String); exit 1 }
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add components/ThemeToggle.tsx components/sidebar.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(ui): v3.44.0 UI Phase 1 Step 5 - Dark Mode Global Toggle

New ThemeToggle component (components/ThemeToggle.tsx):
- 3-way dropdown: Light / Dark / System (نهارى / ليلى / تَلقائى)
- Built on next-themes (already wired in app/layout.tsx)
- Bilingual (Arabic + English), follows app language
- Hydration-mismatch safe via mounted state
- ARIA labels for accessibility

sidebar.tsx:
- Mounted ThemeToggle at top of User Profile section
- Visible above the notification bell
- Available on every page

Impact:
- Users can toggle theme from any page without going to /settings
- Preference persists across sessions
- System theme is followed by default

Safety: zero functional changes, additive only." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) { Write-Host "`n✅ v3.44.0 pushed" -ForegroundColor Green }
