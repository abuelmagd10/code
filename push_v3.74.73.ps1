# v3.74.73 - NotificationCenter mobile: trim header + collapsible filters
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.73"') { Write-Host "+ APP_VERSION = 3.74.73" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.73" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.73]')) { Write-Host "+ CHANGELOG 3.74.73" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.73" -ForegroundColor Red; exit 1 }

$nc = Get-Content -LiteralPath "components/NotificationCenter.tsx" -Raw
$lineCount = ($nc -split "`n").Count
if ($lineCount -ge 1270) { Write-Host "+ NotificationCenter intact ($lineCount lines)" -ForegroundColor Green } else { Write-Host "X NotificationCenter truncated ($lineCount lines)" -ForegroundColor Red; exit 1 }
if ($nc.TrimEnd().EndsWith("}")) { Write-Host "+ ends with }" -ForegroundColor Green } else { exit 1 }

if ($nc -match 'showFiltersOnMobile' -and `
    $nc -match 'hidden sm:inline' -and `
    $nc -match 'hidden md:grid') {
    Write-Host "+ all 3 mobile-polish markers present" -ForegroundColor Green
} else { Write-Host "X mobile-polish markers missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String "NotificationCenter\.tsx").Count
if ($err -eq 0) { Write-Host "+ 0 errors" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; $tsc | Select-String "NotificationCenter\.tsx" | Select-Object -First 5; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(mobile): v3.74.73 - NotificationCenter trim header + collapsible filters

Two cosmetic gaps remained after v3.74.71/72:
- 'Mark All Read' button overflowed to 'تَحديد ال...' on 5-inch phones.
- Six filter dropdowns took roughly 22 percent of the viewport on top
  of the 22 percent the header took, pushing every first notification
  below the fold.

Fixes:
- Mark-All-Read label is hidden sm:inline (icon-only on mobile, margin
  also gated on sm).
- Filter grid is hidden by default on < md, revealed by a small 'Filters'
  toggle button. Desktop layout unchanged.

One new state (showFiltersOnMobile), two anchor replaces. Applied via
bash heredoc Python - the pattern that worked in v3.74.71/72.

TypeScript: 0 errors." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.73 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.72.ps1') { Remove-Item -LiteralPath 'push_v3.74.72.ps1' -Force }
}
