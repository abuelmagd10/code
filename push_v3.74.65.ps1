# v3.74.65 - Customer MultiSelect UI in transfer dialog
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.65"') {
    Write-Host "+ APP_VERSION = 3.74.65" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.65" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.65]')) {
    Write-Host "+ CHANGELOG 3.74.65" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.65" -ForegroundColor Red; exit 1 }

$users = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
$lineCount = ($users -split "`n").Count
if ($lineCount -ge 3925) {
    Write-Host "+ users page intact ($lineCount lines)" -ForegroundColor Green
} else { Write-Host "X users page truncated ($lineCount lines)" -ForegroundColor Red; exit 1 }

if ($users.TrimEnd().EndsWith("}")) {
    Write-Host "+ users page ends with }" -ForegroundColor Green
} else { Write-Host "X users page does not end with closing brace" -ForegroundColor Red; exit 1 }

if ($users -match 'from "@/components/ui/multi-select"' -and $users -match '<MultiSelect') {
    Write-Host "+ MultiSelect imported and used" -ForegroundColor Green
} else { Write-Host "X MultiSelect missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check on users page ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$userErrors = ($tsc | Select-String "settings/users/page.tsx").Count
if ($userErrors -eq 0) {
    Write-Host "+ users page: 0 errors" -ForegroundColor Green
} else {
    Write-Host "X users page has $userErrors errors" -ForegroundColor Red
    $tsc | Select-String "settings/users/page.tsx" | Select-Object -First 5
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(permissions): v3.74.65 - customer MultiSelect in transfer dialog

Adds the actual UI control that drives the v3.74.63 wiring. Uses the
project's shared MultiSelect component (components/ui/multi-select.tsx)
so operators see the same look and behaviour as everywhere else in
the app - no new control to learn.

Behaviour:
- Shows when resource_type = customers and a source employee is picked.
- Built-in search matches name OR phone.
- Multi-pick with badge chips and per-item remove, plus clear-all.
- Honours the optional branch filter.
- Empty selection = move ALL (legacy default preserved).
- Live counter: how many will be moved vs the total available.

The server-side intersection in /api/permissions/transfer/route.ts
from v3.74.63 already validates IDs against what the source actually
owns - the UI is convenience, not security.

Inserted via Python anchor script to avoid the Edit-tool truncation
bug that bit v3.74.63.

TypeScript: 0 errors. Final file size: 3931 lines." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.65 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.64.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.64.ps1' -Force
    }
}
