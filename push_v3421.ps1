# v3.42.1 - Touch files to force Turbopack rebuild
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Status ===" -ForegroundColor Cyan
git --no-pager status --short 2>&1 | ForEach-Object { Write-Host $_ }

Write-Host "`n=== Stage + commit ===" -ForegroundColor Cyan
git add components/sidebar.tsx components/CommandPalette.tsx app/settings/users/page.tsx
git --no-pager diff --cached --stat

git commit -m "chore(ui): v3.42.1 - touch files to invalidate Turbopack build cache

Vercel's Turbopack build was reusing cached compilation results
even after empty commits. Adding comments to the 3 modified files
forces a fresh Turbopack rebuild that will actually include v3.42.0
changes (sidebar reorganization, /hr removed from palette, new permissions)." 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: commit failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Push ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

Write-Host "`n[Done] v3.42.1 pushed" -ForegroundColor Green

Get-ChildItem "force_*.ps1","push_*.ps1","commit_*.ps1","merge_*.ps1","fix_*.ps1","nuke_*.ps1","clean_*.ps1","sync_*.ps1","diagnose*.ps1" -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "push_v3421.ps1" } | Remove-Item -Force -ErrorAction SilentlyContinue
