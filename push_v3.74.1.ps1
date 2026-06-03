# v3.74.1 - role labels + expiry + archive history on share rows
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.1"') { Write-Host "+ APP_VERSION = 3.74.1" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.1" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.1\]') { Write-Host "+ CHANGELOG entry for 3.74.1 present" -ForegroundColor Green }
else { Write-Host "X CHANGELOG missing 3.74.1 entry" -ForegroundColor Red; exit 1 }

$pa = Get-Content -LiteralPath "app/api/permissions/route.ts" -Raw
if ($pa -match "include_inactive") {
    Write-Host "+ /api/permissions: include_inactive flag wired" -ForegroundColor Green
} else { Write-Host "X include_inactive missing in /api/permissions" -ForegroundColor Red; exit 1 }

$swm = Get-Content -LiteralPath "app/api/permissions/shared-with-me/route.ts" -Raw
if ($swm -match "include_inactive") {
    Write-Host "+ /api/permissions/shared-with-me: include_inactive wired" -ForegroundColor Green
} else { Write-Host "X include_inactive missing in shared-with-me" -ForegroundColor Red; exit 1 }

$usr = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
if ($usr -match 'archivedSharing' -and $usr -match 'showSharingArchive') {
    Write-Host "+ /settings/users: archive state wired" -ForegroundColor Green
} else { Write-Host "X archive state missing" -ForegroundColor Red; exit 1 }

if ($usr -match 'إظهار المُؤرشَفة' -and $usr -match '🗓') {
    Write-Host "+ archive toggle button + expiry chip present" -ForegroundColor Green
} else { Write-Host "X UI markers missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts `
        app/api/permissions/route.ts `
        app/api/permissions/shared-with-me/route.ts `
        app/settings/users/page.tsx `
        CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(ux): v3.74.1 - role labels + expiry + archive history

Ahmed reviewed the share row 'خالد عجلان <- خالد زيتون | الكل |
تعديل | نشط' and flagged 3 gaps:
  1. expiry duration not visible
  2. role of each party not shown
  3. after delete, row vanishes - no audit trail for users

Done:

UI - share row enrichment (both المشاركات + مُشارَك مَعى tabs):
  - Role badge next to each name: 'خالد عجلان (موظف)' etc.
  - Expiry chip: '🗓 ينتهى DD/MM/YYYY' or '🗓 دائم'
  - Status chip: نَشِط / انتَهى / مُؤرشَف with proper colors
  - Vacation chip auto-added when notes contain
    '[تَفويض إجازة]' tag
  - Created date at bottom
  - Notes preview (2-line clamp), visible on archived rows too

UI - archive toggle:
  - 'إظهار المُؤرشَفة (N)' button at top of both tabs with count
  - Click expands to show deactivated/expired rows below actives
  - Archived rows: reduced opacity + gray مُؤرشَف badge
  - Independent per-tab toggle
  - Manual delete now confirms first: 'سَيتم أرشَفة هذه
    المُشاركة. يُمكن مُراجعتها لاحقاً...'

API:
  - GET /api/permissions?type=sharing&include_inactive=true
    returns active + archived
  - GET /api/permissions/shared-with-me?include_inactive=true
    bypasses v_shared_with_me view, queries permission_sharing
    directly filtered to grantee=me

State:
  - archivedSharing + showSharingArchive
  - archivedSharedWithMe + showSharedWithMeArchive
  - loadPermissionData fetches both sets in parallel

Verify:
  1. existing row shows role + expiry + status chips
  2. click X -> confirm dialog -> row moves to archive
  3. toggle 'إظهار المُؤرشَفة' shows archived rows
  4. archived rows keep all context for audit
  5. cron-expired shares auto-flip into archive

Files:
  Modified: app/api/permissions/route.ts
  Modified: app/api/permissions/shared-with-me/route.ts
  Modified: app/settings/users/page.tsx
  Modified: lib/version.ts (3.74.0 -> 3.74.1)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.1 pushed" -ForegroundColor Green
}
