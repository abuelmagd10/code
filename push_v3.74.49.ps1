# v3.74.49 - show Created By column on /inventory-transfers list
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.49"') {
    Write-Host "+ APP_VERSION = 3.74.49" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.49" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.49]')) {
    Write-Host "+ CHANGELOG 3.74.49" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.49" -ForegroundColor Red; exit 1 }

$tx = Get-Content -LiteralPath "app/inventory-transfers/page.tsx" -Raw
if ($tx -match "v3\.74\.49") {
    Write-Host "+ v3.74.49 marker present in transfers page" -ForegroundColor Green
} else { Write-Host "X v3.74.49 marker missing in transfers page" -ForegroundColor Red; exit 1 }
if ($tx -match 'created_by_name') {
    Write-Host "+ created_by_name field present" -ForegroundColor Green
} else { Write-Host "X created_by_name missing" -ForegroundColor Red; exit 1 }
if ($tx -match "'Created By'") {
    Write-Host "+ Created By header present" -ForegroundColor Green
} else { Write-Host "X Created By header missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(inventory-transfers): v3.74.49 - show Created By column on transfers list

The /inventory-transfers list showed transfer number, source/destination,
items, branch, status, and date - but not who opened the request. For
approvers reviewing a queue of pending transfers, that is an obvious
accountability gap.

Added a new Created By column to the table. loadData now pulls the
created_by UUID from each transfer row, collects the distinct set, and
fetches the matching user_profiles.display_name/username in one extra
round-trip. The result is merged into each Transfer object as
created_by_name and rendered as a purple chip (em-dash if unresolved).

The existing per-role row filter on the page (store_manager / manager /
accountant scoping) already constrains which transfers a user sees, so
this column inherits the same governance.

Files changed:
- app/inventory-transfers/page.tsx - Transfer interface extended,
  loadData fetches creator names, new <th> + <td>, skeleton cols bumped
  to 11.
- lib/version.ts - APP_VERSION bumped to 3.74.49.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.49 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.48.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.48.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.48.ps1)" -ForegroundColor DarkGray
    }
}
