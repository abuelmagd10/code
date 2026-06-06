# v3.74.70 - mobile-responsive polish on NotificationCenter
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.70"') {
    Write-Host "+ APP_VERSION = 3.74.70" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.70" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.70]')) {
    Write-Host "+ CHANGELOG 3.74.70" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.70" -ForegroundColor Red; exit 1 }

$nc = Get-Content -LiteralPath "components/NotificationCenter.tsx" -Raw
$lineCount = ($nc -split "`n").Count
if ($lineCount -ge 1245) {
    Write-Host "+ NotificationCenter intact ($lineCount lines)" -ForegroundColor Green
} else { Write-Host "X NotificationCenter truncated ($lineCount lines)" -ForegroundColor Red; exit 1 }

if ($nc.TrimEnd().EndsWith("}")) {
    Write-Host "+ NotificationCenter ends with }" -ForegroundColor Green
} else { Write-Host "X NotificationCenter does not end with }" -ForegroundColor Red; exit 1 }

# Verify all 5 responsive markers landed
$markers = @(
    'w-\[95vw\] max-w-4xl max-h-\[95vh\] sm:max-h-\[90vh\]',
    'px-3 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4',
    'text-lg sm:text-2xl font-bold',
    'overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-6 sm:py-4',
    'p-3 sm:p-4 rounded-lg border cursor-pointer'
)
foreach ($m in $markers) {
    if ($nc -match $m) {
        Write-Host "  + responsive marker present: $m" -ForegroundColor Green
    } else { Write-Host "  X missing marker: $m" -ForegroundColor Red; exit 1 }
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$ncErrors = ($tsc | Select-String "NotificationCenter\.tsx").Count
if ($ncErrors -eq 0) {
    Write-Host "+ NotificationCenter: 0 errors" -ForegroundColor Green
} else {
    Write-Host "X NotificationCenter has $ncErrors errors" -ForegroundColor Red
    $tsc | Select-String "NotificationCenter\.tsx" | Select-Object -First 5
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(mobile): v3.74.70 - responsive polish on NotificationCenter

On phones the notification center opened with desktop proportions:
24-pixel padding, text-2xl title, max-w-4xl on a 375-pixel screen.
Titles wrapped awkwardly, filters felt squeezed, cards lost breathing
room.

Five Tailwind tweaks - adaptive sizing only, no logic changes:
- DialogContent: w-[95vw] for mobile, sm:max-h-[90vh] kept for desktop
- Header padding: px-3 / pt-4 / pb-3 on mobile, sm:px-6 etc on desktop
- Title: text-lg on mobile, sm:text-2xl on desktop
- List wrapper: px-3 py-3 on mobile, sm:px-6 sm:py-4 on desktop
- Notification card: p-3 on mobile, sm:p-4 on desktop

Desktop layout untouched at sm: breakpoint (640 px and up). Filter
grid was already responsive (grid-cols-2 md:grid-cols-4 lg:grid-cols-6).

Applied via Python anchor script - the file is 1,246 lines and the
Edit tool truncation risk was real.

TypeScript: 0 errors on NotificationCenter.tsx.

Note: v3.74.69 was DB-only (AI knowledge injection), so lib/version.ts
stayed at 3.74.68. This bump jumps to 3.74.70 because code is shipping
for the first time since v3.74.68." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.70 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.68.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.68.ps1' -Force
    }
}
