# v3.48.2 — force Vercel rebuild (v3.48.1 was cached)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Status ===" -ForegroundColor Cyan
git --no-pager status --short 2>&1 | ForEach-Object { Write-Host $_ }

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add components/CommandPalette.tsx app/not-found.tsx
git --no-pager diff --cached --stat
git commit -m "chore(ui): v3.48.2 - touch files to bust Vercel build cache

v3.48.1 commit pushed successfully but Vercel's Turbopack build cache
served the v3.48.0 chunks (no permission filtering). Adding comments
to the two affected files forces a fresh build that will emit chunks
containing useAccess/canAccessPage/visibleCommands logic." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) { Write-Host "`n✅ v3.48.2 pushed" -ForegroundColor Green }
