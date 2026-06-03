# v3.62.0 - Phase B start: Backup Storage + History (B1+B2)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan

$newFiles = @(
    "app/api/backup/list/route.ts",
    "app/api/backup/[id]/download/route.ts",
    "app/api/backup/[id]/route.ts",
    "components/backup/BackupHistoryTable.tsx"
)
foreach ($f in $newFiles) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

$modFiles = @(
    "lib/version.ts",
    "app/api/backup/export/route.ts",
    "app/settings/page.tsx"
)
foreach ($f in $modFiles) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.62.0"') { Write-Host "  + APP_VERSION = 3.62.0" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.62.0" -ForegroundColor Red; exit 1 }

$exp = Get-Content "app/api/backup/export/route.ts" -Raw
if ($exp -match "backup_history" -and $exp -match "supabase\.storage" -and $exp -match "const BUCKET") {
    Write-Host "  + export now uploads to Storage + inserts history row" -ForegroundColor Green
} else {
    Write-Host "  X export not upgraded" -ForegroundColor Red; exit 1
}

$listR = Get-Content "app/api/backup/list/route.ts" -Raw
if ($listR -match 'requireOwnerOrAdmin' -and $listR -match "backup_history") {
    Write-Host "  + list endpoint OK" -ForegroundColor Green
} else { Write-Host "  X list endpoint broken" -ForegroundColor Red; exit 1 }

$dlR = Get-Content -LiteralPath "app/api/backup/[id]/download/route.ts" -Raw
if ($dlR -match 'createSignedUrl' -and $dlR -match 'SIGNED_URL_TTL_SEC') {
    Write-Host "  + download endpoint OK (signed URL)" -ForegroundColor Green
} else { Write-Host "  X download endpoint broken" -ForegroundColor Red; exit 1 }

$delR = Get-Content -LiteralPath "app/api/backup/[id]/route.ts" -Raw
if ($delR -match 'requireOwner' -and $delR -match 'logAudit' -and $delR -match 'supabase\.storage' -and $delR -match "status: 'deleted'") {
    Write-Host "  + delete endpoint OK (owner-only + audit + soft delete)" -ForegroundColor Green
} else { Write-Host "  X delete endpoint broken" -ForegroundColor Red; exit 1 }

$tbl = Get-Content "components/backup/BackupHistoryTable.tsx" -Raw
if ($tbl -match 'BackupHistoryTable' -and $tbl -match '/api/backup/list' -and $tbl -match 'AlertDialog') {
    Write-Host "  + BackupHistoryTable component OK" -ForegroundColor Green
} else { Write-Host "  X table component incomplete" -ForegroundColor Red; exit 1 }

$page = Get-Content "app/settings/page.tsx" -Raw
if ($page -match 'BackupHistoryTable' -and $page -match 'historyRefreshKey') {
    Write-Host "  + settings page renders history table" -ForegroundColor Green
} else { Write-Host "  X settings page not wired" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add `
    lib/version.ts `
    app/api/backup/export/route.ts `
    app/api/backup/list/route.ts `
    "app/api/backup/[id]/download/route.ts" `
    "app/api/backup/[id]/route.ts" `
    components/backup/BackupHistoryTable.tsx `
    app/settings/page.tsx `
    CHANGELOG.md 2>&1 | Out-Null

git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(backup): v3.62.0 Phase B start - Storage bucket + History UI (B1+B2)

B1 - Supabase Storage + backup_history table.
  Every export now also uploads a copy to a private `backups` bucket
  under {company_id}/{id}.json. A backup_history row is written with
  size, record count, system version, checksum, encryption flag,
  status, and expires_at (30 days from now). Full RLS:
    SELECT: owner/admin/GM of the company
    INSERT: server-side via the export endpoint
    DELETE: owner only

  Storage policies on storage.objects restrict read/upload/delete to
  the matching company folder. A user cannot read or write into
  another company's folder.

B2 - Backup History UI.
  components/backup/BackupHistoryTable.tsx — bilingual responsive
  table showing the last 20 backups with size, records, version,
  encryption badge, expiry countdown (amber when <= 3 days),
  Download (signed URL, 5-min TTL), and Delete (owner-only, with
  confirm dialog).

  Three new API routes:
    GET    /api/backup/list             paginated list
    GET    /api/backup/[id]/download    signed URL, 5-min expiry
    DELETE /api/backup/[id]             owner-only soft delete + audit

  Settings page now renders the table below the existing backup
  card and auto-refreshes after a new export.

Files:
  Migration: v3_62_0_backup_history_and_storage (applied via MCP)
  New: app/api/backup/list/route.ts
  New: app/api/backup/[id]/download/route.ts
  New: app/api/backup/[id]/route.ts (DELETE)
  New: components/backup/BackupHistoryTable.tsx
  Modified: app/api/backup/export/route.ts (Storage upload + history insert)
  Modified: app/settings/page.tsx (renders BackupHistoryTable)
  Modified: lib/version.ts (3.61.3 -> 3.62.0)

Open items in Phase B (B3..B8 + bonus): cron, restore progress,
email notifications, HMAC, rate limit, gzip, fix companies: 0.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.62.0 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel deploys:" -ForegroundColor Cyan
    Write-Host "  1. Click 'Export' - a row should appear in the new history table" -ForegroundColor White
    Write-Host "  2. Click Download on a row - file downloads via signed URL" -ForegroundColor White
    Write-Host "  3. As a non-owner: Delete button should be hidden" -ForegroundColor White
    Write-Host "  4. As owner: Delete -> confirm dialog -> row disappears + audit log entry" -ForegroundColor White
    Write-Host "  5. Sign in as another company: history table should be empty (RLS)" -ForegroundColor White
}
