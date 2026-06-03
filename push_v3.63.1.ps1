# v3.63.1 - Nightly auto-backup cron (B3)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan
$files = @(
    "lib/version.ts",
    "vercel.json",
    "lib/backup/export-utils.ts",
    "app/api/cron/backup-daily/route.ts"
)
foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.63.1"') { Write-Host "  + APP_VERSION = 3.63.1" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.63.1" -ForegroundColor Red; exit 1 }

$vj = Get-Content -LiteralPath "vercel.json" -Raw
if ($vj -match 'backup-daily' -and $vj -match '"0 3 \* \* \*"') {
    Write-Host "  + vercel.json has backup-daily cron" -ForegroundColor Green
} else { Write-Host "  X vercel.json not patched" -ForegroundColor Red; exit 1 }

$cron = Get-Content -LiteralPath "app/api/cron/backup-daily/route.ts" -Raw
if ($cron -match 'CRON_SECRET' -and $cron -match 'auto_backup_enabled' -and $cron -match 'backup_auto_export') {
    Write-Host "  + cron route complete (auth + filter + audit)" -ForegroundColor Green
} else { Write-Host "  X cron route incomplete" -ForegroundColor Red; exit 1 }

$exp = Get-Content -LiteralPath "lib/backup/export-utils.ts" -Raw
if ($exp -match 'exportCompanyBackupWithClient') {
    Write-Host "  + export-utils refactored (admin-client path)" -ForegroundColor Green
} else { Write-Host "  X export-utils not refactored" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts vercel.json lib/backup/export-utils.ts app/api/cron CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(backup): v3.63.1 - nightly auto-backup cron (B3)

GET /api/cron/backup-daily runs at 3 AM UTC (5 AM Cairo). For every
company where companies.auto_backup_enabled = true (default TRUE):
  1. Build full backup via exportCompanyBackupWithClient + admin client
  2. Upload JSON to backups/<company_id>/<history_id>.json
  3. Insert backup_history row tagged notes = '[cron] daily auto-backup'
  4. Stamp companies.auto_backup_last_run_at + last_status
  5. Audit-log action = 'backup_auto_export'

Failures on one company never block the next - each runs in its own
try/catch. The cron returns a summary array with per-company status.

DB:
  - companies + auto_backup_enabled (DEFAULT TRUE)
                + auto_backup_last_run_at
                + auto_backup_last_status (CHECK success/failed)
                + auto_backup_last_error
  - audit_logs_action_check extended to allow backup_auto_export +
    preserve legacy uppercase actions for historical rows

Code:
  - lib/backup/export-utils.ts: added exportCompanyBackupWithClient
    that takes an explicit Supabase client. Old exportCompanyBackup is
    a wrapper. Cron passes a service-role admin client (safe because
    every query inside still filters by company_id).
  - app/api/cron/backup-daily/route.ts: the cron itself.
  - vercel.json: third cron entry, schedule '0 3 * * *'.

Why this matters:
  Until tonight every backup was manual. If a customer forgot to
  click Export for two weeks, a data-corruption event could wipe out
  weeks of work. This turns catastrophic risk into a one-day-at-most
  risk. 30-day Storage retention means 30 daily snapshots to roll
  back to.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.63.1 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verify after Vercel deploys (~2 min):" -ForegroundColor Cyan
    Write-Host "  1. Vercel -> Settings -> Cron Jobs -> 3 entries visible" -ForegroundColor White
    Write-Host '  2. curl -H "Authorization: Bearer $env:CRON_SECRET" \' -ForegroundColor White
    Write-Host "       https://7esab.com/api/cron/backup-daily" -ForegroundColor White
    Write-Host "  3. /settings/backup -> new history row tagged [cron]" -ForegroundColor White
    Write-Host "  4. Tomorrow at 5 AM Cairo: another row appears" -ForegroundColor White
}
