# v3.73.1 hotfix - Smart resource-type dropdown based on source user records
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.73.1"') { Write-Host "+ APP_VERSION = 3.73.1" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.73.1" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.73.1\]') { Write-Host "+ CHANGELOG entry for 3.73.1 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.73.1 entry" -ForegroundColor Red; exit 1 }

$usr = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw

if ($usr -match 'sourceUserCounts' -and $usr -match 'fetchSourceUserCounts' -and $usr -match 'get_user_record_counts') {
    Write-Host "+ sourceUserCounts state + fetcher + RPC wired" -ForegroundColor Green
} else { Write-Host "X smart filter wiring missing" -ForegroundColor Red; exit 1 }

# Both dialogs must show counts in their dropdowns
$matches = ([regex]::Matches($usr, "العملاء \{c \?")).Count
if ($matches -ge 2) {
    Write-Host "+ both dialogs render counts (occurrences: $matches)" -ForegroundColor Green
} else { Write-Host "X expected >=2 dropdown renderings, found $matches" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        app/settings/users/page.tsx `
        CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(ux): v3.73.1 - smart resource-type dropdown by source user records

Ahmed pointed out a real UX gap: when picking a source employee
in Vacation Cover or Permission Management dialog, the
'resource type' dropdown showed all options regardless of
whether the source actually owned any records of that type.

Fix:
  - New RPC get_user_record_counts(company_id, user_id) returns
    counts of customers/estimates/sales_orders/bookings owned
    by the user in the company.
  - When source user changes in either dialog, counts are
    fetched and cached.
  - Each dropdown option now shows the actual count and is
    disabled if the count is zero.
  - 'All' shows total and is disabled if everything is zero.
  - If only one category has records, dropdown auto-narrows to
    that category, saving the user a click.
  - Warning banner appears when source has zero ownable records.

Verify:
  1. Pick a staff user with only customers + SOs - bookings
     and estimates show (0) and disabled
  2. Pick a purchasing_officer - everything shows (0) with
     warning banner
  3. Pick a booking_officer with only bookings - auto-narrows
     to bookings option

Files:
  DB migration: v3_73_1_get_user_record_counts_rpc
  Modified: app/settings/users/page.tsx
  Modified: lib/version.ts (3.73.0 -> 3.73.1)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.73.1 pushed" -ForegroundColor Green
}
