# v3.74.72 - bell closes mobile sidebar before opening notification sheet
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.72"') {
    Write-Host "+ APP_VERSION = 3.74.72" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.72" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.72]')) {
    Write-Host "+ CHANGELOG 3.74.72" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.72" -ForegroundColor Red; exit 1 }

$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
$lineCount = ($sb -split "`n").Count
if ($lineCount -ge 1280) {
    Write-Host "+ sidebar intact ($lineCount lines)" -ForegroundColor Green
} else { Write-Host "X sidebar truncated ($lineCount lines)" -ForegroundColor Red; exit 1 }

if ($sb -match 'setIsOpen\(false\); setNotificationCenterOpen\(true\)') {
    Write-Host "+ bell click closes sidebar first" -ForegroundColor Green
} else { Write-Host "X bell click wiring missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$sbErrors = ($tsc | Select-String "components/sidebar\.tsx").Count
if ($sbErrors -eq 0) {
    Write-Host "+ sidebar.tsx: 0 errors" -ForegroundColor Green
} else {
    Write-Host "X sidebar.tsx has $sbErrors errors" -ForegroundColor Red
    $tsc | Select-String "components/sidebar\.tsx" | Select-Object -First 5
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(mobile): v3.74.72 - bell closes sidebar before opening notification sheet

v3.74.71 made notifications render as a bottom Sheet on mobile, but the
sidebar at z-[9998] stayed on screen when the bell inside the sidebar
was tapped, hiding the new sheet entirely.

Single-line fix on the bell onClick: setIsOpen(false) collapses the
mobile sidebar rail first, then the bottom sheet opens with nothing
covering it. Desktop has no overlay sidebar to begin with so behaviour
is unchanged there." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.72 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.71.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.71.ps1' -Force
    }
}
