# One-time fix: normalize components/Sidebar.tsx -> components/sidebar.tsx
# on the Windows filesystem to match how git tracks it.
#
# Why this is needed:
#   - git ls-files shows the file as `components/sidebar.tsx` (lowercase).
#   - NTFS on this machine has the on-disk entry stored as `Sidebar.tsx`
#     (capital S), preserved from an earlier edit that used that casing.
#   - Windows is case-insensitive so both spellings open the same file
#     at runtime, but TypeScript's forceConsistentCasingInFileNames
#     compares the imported path string against the enumerated filename
#     string and trips TS1261 when they differ.
#
# The fix is a case-only rename inside git. Two `git mv` steps via a
# temporary name because Windows won't accept a single rename that
# differs only in case.

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") {
    Remove-Item ".git/index.lock" -Force
    Write-Host "+ Cleared stale .git/index.lock" -ForegroundColor Yellow
}

Write-Host "=== Two-step case-only rename ===" -ForegroundColor Cyan
git mv -f components/Sidebar.tsx components/_tmp_sidebar.tsx
git mv -f components/_tmp_sidebar.tsx components/sidebar.tsx

Write-Host "`n=== Verify disk casing ===" -ForegroundColor Cyan
Get-ChildItem components/sidebar.tsx | Format-Table Name, LastWriteTime

Write-Host "`n=== Stage + commit + push ===" -ForegroundColor Cyan
git add -A components/
git --no-pager diff --cached --stat
git commit -m "chore(fs): normalize sidebar.tsx casing on disk to match git index

The on-disk NTFS entry was Sidebar.tsx (capital) while git tracked
sidebar.tsx (lowercase). Windows is case-insensitive so both worked
at runtime, but TypeScript's forceConsistentCasingInFileNames trips
TS1261 locally, and Vercel/Linux build fails on any import using
the capital casing.

Two-step git mv through a temporary name forces NTFS to record the
filename in lowercase, matching git." 2>&1 | ForEach-Object { Write-Host $_ }

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

Write-Host "`n+ Done. Now re-run .\push_v3.74.14.ps1" -ForegroundColor Green
