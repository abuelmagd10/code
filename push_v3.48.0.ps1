# v3.48.0 — Custom 404 Page
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify ===" -ForegroundColor Cyan
if (Test-Path "app\not-found.tsx") { Write-Host "  ✓ not-found.tsx exists" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }
$nf = Get-Content "app\not-found.tsx" -Raw
if ($nf -match "الصفحة غير مَوجودة") { Write-Host "  ✓ Arabic title" -ForegroundColor Green } else { Write-Host "  ✗ missing Arabic" -ForegroundColor Red }
if ($nf -match "Page Not Found") { Write-Host "  ✓ English title" -ForegroundColor Green } else { Write-Host "  ✗ missing English" -ForegroundColor Red }
if ($nf -match "tap-target") { Write-Host "  ✓ uses tap-target utility" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red }
if ($nf -match "Ctrl \+ K") { Write-Host "  ✓ Ctrl+K hint" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "TypeScript errors:" -ForegroundColor Red; Write-Host ($tscOutput | Out-String); exit 1 }
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add app/not-found.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "feat(ui): v3.48.0 UI Phase 1 Step 9 - Custom 404 Page

Replaces Next.js default 404 with a branded, bilingual page.

app/not-found.tsx (new):
- Giant 404 with gradient (primary -> info) and glow effect
- Arabic title: 'الصفحة غير مَوجودة'
- English subtitle: 'Page Not Found'
- Bilingual description (RTL Arabic + LTR English)
- Two action buttons: dashboard (primary) + Go Home (outline)
- Helpful suggestions: links to common pages
- Ctrl+K hint that complements the Command Palette feature

Features:
- Uses design tokens (primary, info, muted-foreground, card)
- Dark mode automatic
- Responsive (mobile + desktop)
- tap-target class for 44x44 buttons (Step 8 integration)
- Server-rendered, no JavaScript needed
- ARIA labels for accessibility

Safety:
- Pure new file, touches nothing existing
- Server component, no client state" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) { Write-Host "`n✅ v3.48.0 pushed" -ForegroundColor Green }
