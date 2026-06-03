# Quick push for Google Search Console verification file
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verifying file ===" -ForegroundColor Cyan
if (-not (Test-Path -LiteralPath "public/googlebab064d0744a7afb.html")) {
    Write-Host "X verification file missing" -ForegroundColor Red
    exit 1
}
$content = Get-Content -LiteralPath "public/googlebab064d0744a7afb.html" -Raw
if ($content -match 'google-site-verification') {
    Write-Host "+ Verification file present" -ForegroundColor Green
    Write-Host "  Content: $content" -ForegroundColor Gray
} else {
    Write-Host "X File does not contain verification line" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Git push ===" -ForegroundColor Cyan
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add public/googlebab064d0744a7afb.html 2>&1 | Out-Null
$staged = git diff --cached --name-only

if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "chore(seo): add Google Search Console verification file

Allows ownership verification of https://7esab.com via the
HTML-file method. Pair of v3.65.0 (sitemap + blog).

Next step (manual): Google Search Console -> Verify ownership
-> the file appears -> request sitemap indexing.

File: public/googlebab064d0744a7afb.html" 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ Pushed successfully" -ForegroundColor Green
    Write-Host ""
    Write-Host "After Vercel deploys (~1 min):" -ForegroundColor Cyan
    Write-Host "  1. Open https://7esab.com/googlebab064d0744a7afb.html" -ForegroundColor White
    Write-Host "     -> should show: 'google-site-verification: ...'" -ForegroundColor Gray
    Write-Host "  2. Back to Google Search Console -> click VERIFY" -ForegroundColor White
    Write-Host "  3. Once verified, submit sitemap: sitemap.xml" -ForegroundColor White
    Write-Host "  4. Request indexing for the 3 blog articles" -ForegroundColor White
}
