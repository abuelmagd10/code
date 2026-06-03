# v3.62.1 - Phase B hotfix: three silent-failure bugs in audit + history insert
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan

$files = @(
    "lib/version.ts",
    "app/api/backup/export/route.ts",
    "app/api/backup/[id]/route.ts",
    "app/api/backup/restore/route.ts",
    "supabase/migrations/20260529100000_v3_62_1_backup_audit_and_insert_fix.sql"
)
foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.62.1"') { Write-Host "  + APP_VERSION = 3.62.1" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.62.1" -ForegroundColor Red; exit 1 }

foreach ($f in @("app/api/backup/export/route.ts","app/api/backup/[id]/route.ts","app/api/backup/restore/route.ts")) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -notmatch "from '@/lib/audit-log'" -and $c -match "from\('audit_logs'\)\.insert") {
        Write-Host "  + $f uses direct audit_logs insert" -ForegroundColor Green
    } else {
        Write-Host "  X $f still using logAudit wrapper" -ForegroundColor Red; exit 1
    }
}

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
    "app/api/backup/[id]/route.ts" `
    app/api/backup/restore/route.ts `
    supabase/migrations/20260529100000_v3_62_1_backup_audit_and_insert_fix.sql `
    CHANGELOG.md 2>&1 | Out-Null

git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(backup): v3.62.1 - three silent-failure bugs uncovered in v3.62.0

End-to-end testing on production exposed three silent-failure paths that
made backups appear to succeed (file downloaded) but left the history
table and audit log empty.

(1) audit_logs.action CHECK constraint missing 'backup_*' values.
    Every backup audit log insert was being rejected by the database
    and the error swallowed by the API try/catch. Constraint extended
    via migration to include backup_export, backup_delete,
    backup_restore, backup_restore_failed.

(2) backup_history had no INSERT policy.
    The export endpoint runs with the user's cookie session (not
    service-role), so RLS blocked the insert and the history table
    stayed empty even though the Storage upload succeeded.
    Added INSERT policy for owner/admin/general_manager.

(3) logAudit does not work server-side.
    It is a client-side wrapper that does fetch('/api/audit-log')
    with a relative URL - fails inside API routes (no host context).
    All three backup routes (export, [id] delete, restore) now write
    to audit_logs directly via supabase.from('audit_logs').insert
    with the server client. Each in its own try/catch so audit
    failure cannot break the user-visible flow.

Files:
  New: supabase/migrations/20260529100000_v3_62_1_backup_audit_and_insert_fix.sql
  Modified: app/api/backup/export/route.ts
  Modified: app/api/backup/[id]/route.ts
  Modified: app/api/backup/restore/route.ts
  Modified: lib/version.ts (3.62.0 -> 3.62.1)

Verified on production after the DB-only fixes were applied:
  - Two test exports created 2 backup_history rows + 2 Storage files
  - Storage path: {company_id}/{id}.json
  - Identical canonical checksums (A1 still deterministic)
  - Expires at = NOW() + 30 days

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.62.1 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel deploys:" -ForegroundColor Cyan
    Write-Host "  1. Export a backup - row appears in history table" -ForegroundColor White
    Write-Host "  2. Check audit_logs for action='backup_export' - row should exist" -ForegroundColor White
    Write-Host "  3. As owner, delete a backup - row marked 'deleted' + audit row added" -ForegroundColor White
}
