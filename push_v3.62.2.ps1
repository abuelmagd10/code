# v3.62.2 - populate user_email + user_name in audit_logs for backup actions
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan

$files = @(
    "lib/version.ts",
    "lib/audit-actor.ts",
    "app/api/backup/export/route.ts",
    "app/api/backup/[id]/route.ts",
    "app/api/backup/restore/route.ts"
)
foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.62.2"') { Write-Host "  + APP_VERSION = 3.62.2" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.62.2" -ForegroundColor Red; exit 1 }

$helper = Get-Content -LiteralPath "lib/audit-actor.ts" -Raw
if ($helper -match 'resolveActorInfo' -and $helper -match 'full_name' -and $helper -match 'emailPrefix') {
    Write-Host "  + audit-actor helper present and complete" -ForegroundColor Green
} else { Write-Host "  X audit-actor helper missing fields" -ForegroundColor Red; exit 1 }

foreach ($f in @("app/api/backup/export/route.ts","app/api/backup/[id]/route.ts","app/api/backup/restore/route.ts")) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -match "resolveActorInfo" -and $c -match "from '@/lib/audit-actor'") {
        Write-Host "  + $f uses resolveActorInfo" -ForegroundColor Green
    } else { Write-Host "  X $f missing actor helper" -ForegroundColor Red; exit 1 }
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
    lib/audit-actor.ts `
    app/api/backup/export/route.ts `
    "app/api/backup/[id]/route.ts" `
    app/api/backup/restore/route.ts `
    CHANGELOG.md 2>&1 | Out-Null

git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(audit): v3.62.2 - populate user_email + user_name in audit_logs

The /settings/audit-log page rendered an empty user cell for backup
actions because the routes only set user_id, leaving user_name and
user_email as null. Display logic falls back to user_name || user_email,
both null produced a blank row.

New helper lib/audit-actor.ts -> resolveActorInfo(user) resolves the
display name in priority order:
  1. raw_user_meta_data.full_name
  2. raw_user_meta_data.name
  3. local-part of email (before @)
  4. raw email

All four backup audit inserts (export, delete, restore success,
restore failure) now spread ...resolveActorInfo(user) so the columns
populate automatically.

Existing v3.62.0 / v3.62.1 rows were backfilled directly in the DB
(2 rows for the owner of test company).

The helper is generic and should be reused as more server-side
actions get wired into audit_logs.

Files:
  New: lib/audit-actor.ts
  Modified: app/api/backup/export/route.ts
  Modified: app/api/backup/[id]/route.ts
  Modified: app/api/backup/restore/route.ts (two inserts)
  Modified: lib/version.ts (3.62.1 -> 3.62.2)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.62.2 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test after Vercel deploys:" -ForegroundColor Cyan
    Write-Host "  1. Re-export a backup" -ForegroundColor White
    Write-Host "  2. Open /settings/audit-log - user cell now shows '7esab.erb' (or your display name)" -ForegroundColor White
    Write-Host "  3. Open the row details - user_name and user_email both populated" -ForegroundColor White
}
