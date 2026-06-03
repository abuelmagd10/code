# v3.63.3 - Backup B5: failure email to company owner
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan
foreach ($f in @("lib/version.ts", "lib/backup/backup-emails.ts", "app/api/cron/backup-daily/route.ts")) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.63.3"') { Write-Host "  + APP_VERSION = 3.63.3" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.63.3" -ForegroundColor Red; exit 1 }

$emails = Get-Content -LiteralPath "lib/backup/backup-emails.ts" -Raw
if ($emails -match 'sendBackupFailureNotice' -and $emails -match 'nodemailer') {
    Write-Host "  + backup-emails.ts complete" -ForegroundColor Green
} else { Write-Host "  X backup-emails.ts incomplete" -ForegroundColor Red; exit 1 }

$cron = Get-Content -LiteralPath "app/api/cron/backup-daily/route.ts" -Raw
if ($cron -match 'sendBackupFailureNotice' -and $cron -match 'auth.admin.getUserById') {
    Write-Host "  + cron wired to email path" -ForegroundColor Green
} else { Write-Host "  X cron not wired" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts lib/backup/backup-emails.ts app/api/cron/backup-daily/route.ts CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(backup): v3.63.3 - email company owner on cron backup failure (B5)

lib/backup/backup-emails.ts - sendBackupFailureNotice() sends a clean
Arabic/RTL email explaining what happened, embedding the truncated
error message, linking straight to /settings/backup, and reminding
the owner the next attempt is automatic tomorrow morning. Same SMTP
transport already used for renewal emails.

app/api/cron/backup-daily/route.ts - after the main loop finishes,
iterates the failed companies once more, resolves each owner's email
via admin.auth.admin.getUserById, and dispatches the failure notice.
Email failures are non-fatal; the underlying backup failure was
already recorded in audit_logs and companies.auto_backup_last_error,
so an SMTP outage cannot mask the real signal.

Counter fields emails_sent / emails_failed added to the cron summary.

Why only failures: a success email every day for every tenant would
be noise the owner trains themselves to ignore. /settings/backup
already shows successes in the history table. Email is reserved for
the case that actually needs human action.

Files:
  New: lib/backup/backup-emails.ts
  Modified: app/api/cron/backup-daily/route.ts
  Modified: lib/version.ts (3.63.2 -> 3.63.3)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.63.3 pushed" -ForegroundColor Green
}
