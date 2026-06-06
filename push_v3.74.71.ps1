# v3.74.71 - NotificationCenter renders as Sheet on mobile
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.71"') {
    Write-Host "+ APP_VERSION = 3.74.71" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.71" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.71]')) {
    Write-Host "+ CHANGELOG 3.74.71" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.71" -ForegroundColor Red; exit 1 }

$nc = Get-Content -LiteralPath "components/NotificationCenter.tsx" -Raw
$lineCount = ($nc -split "`n").Count
if ($lineCount -ge 1255) {
    Write-Host "+ NotificationCenter intact ($lineCount lines)" -ForegroundColor Green
} else { Write-Host "X NotificationCenter truncated ($lineCount lines)" -ForegroundColor Red; exit 1 }

if ($nc.TrimEnd().EndsWith("}")) {
    Write-Host "+ NotificationCenter ends with }" -ForegroundColor Green
} else { Write-Host "X NotificationCenter does not end with }" -ForegroundColor Red; exit 1 }

# Verify Sheet conversion landed
if ($nc -match 'from "@/components/ui/sheet"' -and `
    $nc -match 'useIsMobile' -and `
    $nc -match 'const M  = isMobile \? Sheet : Dialog' -and `
    $nc -match 'const MC = \(isMobile \? SheetContent : DialogContent\)') {
    Write-Host "+ Sheet/Dialog runtime alias present" -ForegroundColor Green
} else { Write-Host "X Sheet alias wiring missing" -ForegroundColor Red; exit 1 }

# Verify the 2 MC opens with sheetSide spread
$mcOpens = ([regex]::Matches($nc, '<MC\s+\{\.\.\.sheetSide\}')).Count
if ($mcOpens -eq 2) {
    Write-Host "+ Both MC opens carry sheetSide spread" -ForegroundColor Green
} else { Write-Host "X expected 2 MC opens, found $mcOpens" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(mobile): v3.74.71 - NotificationCenter renders as Sheet on mobile

v3.74.70 only adjusted padding and kept the centered Dialog. On a
375-px phone that's still a tiny floating modal - the user called
the result 'very bad'.

Below 768 px the notification center now renders as a Sheet sliding
from the bottom of the screen at 95vh - the pattern Stripe / Linear /
Slack use. At >= 768 px the existing Dialog is unchanged.

Implementation: alias the primitives at runtime instead of duplicating
the JSX. One body, two shells:

  const M  = isMobile ? Sheet : Dialog
  const MC = isMobile ? SheetContent : DialogContent
  const MH = isMobile ? SheetHeader : DialogHeader
  const MT = isMobile ? SheetTitle : DialogTitle
  const MD = isMobile ? SheetDescription : DialogDescription
  const sheetSide = isMobile ? { side: 'bottom' as const } : {}

The 1200-line component keeps using M / MC / MH / MT / MD throughout -
no copy-pasted markup, no scattered if-isMobile branches.

SheetContent gets h-[95vh] w-full and side=bottom on mobile.
DialogContent keeps w-[95vw] max-w-4xl max-h-[90vh] on desktop.

Applied via a bash-heredoc Python script - the Write tool truncated
two earlier attempts at the helper file in this session.

TypeScript: 0 errors." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.71 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.70.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.70.ps1' -Force
    }
}
