# Clear wrong GitHub credentials + try SSH first, fallback to HTTPS
# ============================================================
# Issue: Credential Manager has 'goldwallet31-wq' cached but the
# repo belongs to 'abuelmagd10'. Push gets HTTP 403.
# ============================================================

$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "`n=== Step 1: Clear cached GitHub credentials ===" -ForegroundColor Cyan
# Remove the cached github.com credential from Windows Credential Manager
cmdkey /list 2>&1 | Select-String -Pattern "github" | ForEach-Object {
    Write-Host "Found: $_" -ForegroundColor Yellow
}
cmdkey /delete:git:https://github.com 2>&1 | ForEach-Object { Write-Host $_ }
cmdkey /delete:git:https://abuelmagd10@github.com 2>&1 | ForEach-Object { Write-Host $_ }
cmdkey /delete:git:https://goldwallet31-wq@github.com 2>&1 | ForEach-Object { Write-Host $_ }
cmdkey /delete:LegacyGeneric:target=git:https://github.com 2>&1 | ForEach-Object { Write-Host $_ }
Write-Host "✓ Credentials cleared" -ForegroundColor Green

Write-Host "`n=== Step 2: Try SSH first (best option) ===" -ForegroundColor Cyan
# Check if SSH agent is running + has keys
$sshKeys = ssh-add -l 2>&1
Write-Host "SSH keys loaded: $sshKeys"

if (Test-Path "$env:USERPROFILE\.ssh\id_ed25519" -or (Test-Path "$env:USERPROFILE\.ssh\id_rsa")) {
    Write-Host "SSH keys found in ~/.ssh/" -ForegroundColor Green

    # Start ssh-agent service
    Get-Service ssh-agent -ErrorAction SilentlyContinue | Start-Service -ErrorAction SilentlyContinue

    # Try to add keys
    if (Test-Path "$env:USERPROFILE\.ssh\id_ed25519") { ssh-add "$env:USERPROFILE\.ssh\id_ed25519" 2>&1 | Out-Null }
    if (Test-Path "$env:USERPROFILE\.ssh\id_rsa") { ssh-add "$env:USERPROFILE\.ssh\id_rsa" 2>&1 | Out-Null }

    # Switch back to SSH
    git remote set-url origin "git@github.com:abuelmagd10/code.git"
    Write-Host "`n=== Trying SSH push ===" -ForegroundColor Cyan
    git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Pushed via SSH" -ForegroundColor Green
        exit 0
    }
    Write-Host "SSH failed. Falling back to HTTPS..." -ForegroundColor Yellow
}

Write-Host "`n=== Step 3: HTTPS push (will prompt for credentials) ===" -ForegroundColor Cyan
git remote set-url origin "https://github.com/abuelmagd10/code.git"
Write-Host "When prompted:" -ForegroundColor Yellow
Write-Host "  Username: abuelmagd10" -ForegroundColor White
Write-Host "  Password: your GitHub Personal Access Token (NOT password)" -ForegroundColor White
Write-Host "  Get token at: https://github.com/settings/tokens (classic, with 'repo' scope)" -ForegroundColor Gray
Write-Host ""
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Pushed via HTTPS" -ForegroundColor Green
} else {
    Write-Host "`n❌ Push still failed." -ForegroundColor Red
    Write-Host "ALTERNATIVE: Use GitHub Desktop" -ForegroundColor Yellow
    Write-Host "  1. Open GitHub Desktop" -ForegroundColor Gray
    Write-Host "  2. File → Add Local Repository → select this folder" -ForegroundColor Gray
    Write-Host "  3. Make sure logged in as abuelmagd10" -ForegroundColor Gray
    Write-Host "  4. Push origin" -ForegroundColor Gray
}
