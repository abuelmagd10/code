# v3.48.3 — fail-closed permission filter + debug logging
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Verify ===" -ForegroundColor Cyan
$cmdk = Get-Content "components\CommandPalette.tsx" -Raw
if ($cmdk -match "fail-CLOSED") { Write-Host "  ✓ fail-closed logic present" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }
if ($cmdk -match "\[CommandPalette\]") { Write-Host "  ✓ debug logging present" -ForegroundColor Green } else { Write-Host "  ✗ missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tscOutput = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "TypeScript errors:" -ForegroundColor Red; Write-Host ($tscOutput | Out-String); exit 1 }
Write-Host "✓ TypeScript: OK" -ForegroundColor Green

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add components/CommandPalette.tsx
git --no-pager diff --cached --stat
git commit -m "fix(security): v3.48.3 - fail-CLOSED filter + debug logging

Hardens v3.48.1 permission filtering after reports that the palette
still showed all pages for non-admin roles:

1. fail-CLOSED behavior:
   Previously, while access context was hydrating we returned COMMANDS
   (full list). For an accountant this meant a brief window of seeing
   80+ pages before the filter kicks in.
   Now we return ONLY the always-visible entries (resource=null, i.e.
   dashboard + approvals) until accessReady && profile are populated.

2. Debug logging:
   When the palette opens, the browser console prints:
     - accessReady
     - role
     - is_owner / is_admin
     - allowed_pages count
     - visible_commands count
     - total_commands count
   So we can verify the filter is doing its job from the user's browser.

Safety: still no functional change; the actual page-level enforcement
(middleware + PageGuard) is unchanged. This is purely about what the
palette displays." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ v3.48.3 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "🧪 NEXT STEP: After Vercel rebuild (~3-5 min)" -ForegroundColor Cyan
    Write-Host "  1. Open 7esab.com in INCOGNITO window (Ctrl+Shift+N)" -ForegroundColor White
    Write-Host "  2. Login as baikeyous1@gmail.com (accountant)" -ForegroundColor White
    Write-Host "  3. Press F12 to open DevTools Console" -ForegroundColor White
    Write-Host "  4. Press Ctrl+K to open the palette" -ForegroundColor White
    Write-Host "  5. Check Console — you should see [CommandPalette] log with:" -ForegroundColor White
    Write-Host "     role: 'accountant'" -ForegroundColor Yellow
    Write-Host "     is_owner: false" -ForegroundColor Yellow
    Write-Host "     visible_commands: ~20-25 (NOT 80+)" -ForegroundColor Yellow
}
