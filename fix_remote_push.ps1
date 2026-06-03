# Fix SSH issue + push pending v3.42.1 commit
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Current remote ===" -ForegroundColor Cyan
git remote -v 2>&1 | ForEach-Object { Write-Host $_ }

Write-Host "`n=== Switching to HTTPS (avoids SSH key issue) ===" -ForegroundColor Cyan
git remote set-url origin "https://github.com/abuelmagd10/code.git"
git remote -v 2>&1 | ForEach-Object { Write-Host $_ }

Write-Host "`n=== Push (HTTPS will prompt for GitHub credentials if needed) ===" -ForegroundColor Cyan
Write-Host "If prompted, use your GitHub username + Personal Access Token (not password)" -ForegroundColor Yellow
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[Done] v3.42.1 pushed via HTTPS" -ForegroundColor Green
} else {
    Write-Host "`nPush failed. Try one of:" -ForegroundColor Red
    Write-Host "  1. GitHub Desktop sync" -ForegroundColor Yellow
    Write-Host "  2. ssh-add (re-add SSH key) then: git remote set-url origin git@github.com:abuelmagd10/code.git" -ForegroundColor Yellow
}
