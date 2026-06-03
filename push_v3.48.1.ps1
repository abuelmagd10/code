# v3.48.1 — Permission-aware CommandPalette + 404
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify ===" -ForegroundColor Cyan
$cmdk = Get-Content "components\CommandPalette.tsx" -Raw
$nf   = Get-Content "app\not-found.tsx" -Raw

if ($cmdk -match "useAccess") { Write-Host "  ✓ CommandPalette uses useAccess" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }
if ($cmdk -match "getResourceForHref") { Write-Host "  ✓ getResourceForHref function" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }
if ($cmdk -match "visibleCommands") { Write-Host "  ✓ visibleCommands filter" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }
if ($nf -match "useAccess") { Write-Host "  ✓ not-found uses useAccess" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }
if ($nf -match "visibleSuggestions") { Write-Host "  ✓ visibleSuggestions filter" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }
if ($nf -match '"use client"') { Write-Host "  ✓ not-found is client component" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "TypeScript errors:" -ForegroundColor Red; Write-Host ($tscOutput | Out-String); exit 1 }
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add components/CommandPalette.tsx app/not-found.tsx CHANGELOG.md
git --no-pager diff --cached --stat
git commit -m "fix(security): v3.48.1 - permission-aware CommandPalette + 404

CRITICAL UX/security gap: the Ctrl+K palette and 404 page were leaking
the existence of 80+ pages to every signed-in user regardless of their
role's allowed_pages. Now both components consult useAccess.canAccessPage()
the same way the sidebar does.

components/CommandPalette.tsx:
- imports useAccess from access-context
- new getResourceForHref(href) maps each command's URL to a resource key
- visibleCommands useMemo filters COMMANDS by canAccessPage
- Owner/admin shortcut returns full list
- grouped + recentCommands use visibleCommands
- Fail-open while access context is still loading

app/not-found.tsx:
- converted to client component (needs access context)
- helpful-suggestion links filtered by canAccessPage
- homeHref points to the user's first allowed page if dashboard blocked
- updated description to mention permission as a possible cause

Result:
- An accountant pressing Ctrl+K sees only accounting pages
- A store_manager sees only inventory/orders
- No structural information leak about pages a user cannot access" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) { Write-Host "`n✅ v3.48.1 pushed" -ForegroundColor Green }
