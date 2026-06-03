# v3.72.0 - Phase C-1: Vacation Cover one-click delegation
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.72.0"') { Write-Host "+ APP_VERSION = 3.72.0" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.72.0" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.72.0\]') { Write-Host "+ CHANGELOG entry for 3.72.0 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.72.0 entry" -ForegroundColor Red; exit 1 }

$usr = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw

if ($usr -match 'showVacationDialog' -and $usr -match 'handleVacationCover') {
    Write-Host "+ Vacation Cover state + handler present" -ForegroundColor Green
} else { Write-Host "X Vacation Cover state/handler missing" -ForegroundColor Red; exit 1 }

if ($usr -match 'تَفويض إجازة') {
    Write-Host "+ Vacation Cover Arabic label present" -ForegroundColor Green
} else { Write-Host "X Vacation Cover Arabic label missing" -ForegroundColor Red; exit 1 }

if ($usr -match ', Calendar, UserCheck \}') {
    Write-Host "+ Calendar + UserCheck icons imported" -ForegroundColor Green
} else { Write-Host "X Missing Calendar / UserCheck imports" -ForegroundColor Red; exit 1 }

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
    git commit -m "feat(permissions): v3.72.0 - Phase C-1 Vacation Cover one-click

First piece of Phase C of the permission-system audit. Adds a
focused dialog for the most common business case: route an
absent employee's work to a delegate for a fixed time window.

No backend changes. The existing /api/permissions POST already
accepts expires_at and notes. The v3.70.0 cron already
auto-deactivates expired rows. The v3.71.0 RLS already honors
active permission_sharing rows. So this release is purely a
focused UX wrapper that:

  - validates: grantor + at least one grantee + end date,
    end >= start
  - posts to /api/permissions with action=share, can_edit=true,
    expires_at = end-of-day of the picked end date,
    notes = '[تَفويض إجازة] <grantor> - من <start> الى <end> - <reason>'
  - resets and reloads on success

UI:
  - New 'تَفويض إجازة' button next to 'إدارة الصلاحيات'
    in /settings/users -> 'نقل وفتح الصلاحيات' card header
  - New dedicated dialog with 5 focused inputs and an inline
    summary of what is about to be authorized
  - Existing share / transfer / branches dialogs unchanged
  - Lucide imports extended: + Calendar, + UserCheck

Why a dedicated dialog instead of the existing one:
  Vacation cover is a recurring high-frequency operation. The
  existing dialog asks 6 conditional questions; vacation cover
  needs 2. Forcing operators through the long form increases
  the chance of forgetting expires_at or leaving can_edit=false
  so the delegate cannot actually work.

Verify:
  1. Two buttons appear in the perms card header
  2. Submit -> share appears in 'المشاركات' tab + 'مُشارَك مَعى'
     tab of the grantee
  3. Grantee sees absent user's records via v3.71.0 RLS
  4. v3.70.0 cron deactivates the share at expires_at

Phase C remaining:
  v3.73.0 - approval workflow on transfers
  v3.74.0 - position hierarchy
  v3.75.0 - 'who can access X' reporting

Files:
  Modified: app/settings/users/page.tsx
  Modified: lib/version.ts (3.71.0 -> 3.72.0)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.72.0 pushed" -ForegroundColor Green
}
