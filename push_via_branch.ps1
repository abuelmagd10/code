# Workaround for GitHub Internal Server Error on direct push to main
# Push commit to a branch, then merge via GitHub UI
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

$BranchName = "v3.42.1-rebuild-trigger"

Write-Host "`n=== Retry direct push to main first ===" -ForegroundColor Cyan
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Direct push to main succeeded on retry!" -ForegroundColor Green
    exit 0
}

Write-Host "`n=== Direct push failed. Trying via branch... ===" -ForegroundColor Yellow

# Create branch from current commit
git checkout -b $BranchName 2>&1 | ForEach-Object { Write-Host $_ }

Write-Host "`n=== Push branch ===" -ForegroundColor Cyan
git push -u origin $BranchName 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Branch pushed!" -ForegroundColor Green
    Write-Host "`n📋 Now MERGE from GitHub UI:" -ForegroundColor Cyan
    Write-Host "  1. Open: https://github.com/abuelmagd10/code/pull/new/$BranchName" -ForegroundColor White
    Write-Host "  2. Create Pull Request" -ForegroundColor White
    Write-Host "  3. Click 'Merge pull request'" -ForegroundColor White
    Write-Host "  4. Vercel will auto-deploy fresh from the merge" -ForegroundColor White
}

# Switch back to main
git checkout main 2>&1 | Out-Null
