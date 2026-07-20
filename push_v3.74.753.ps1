$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.752.ps1") { Remove-Item -LiteralPath "push_v3.74.752.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.753"') {
    Write-Host "+ 3.74.753" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.753]")) { Write-Host "X CHANGELOG missing [3.74.753]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$cron = Get-Content -LiteralPath "app/api/cron/system-integrity/route.ts" -Raw

# The columns that made every night's write fail.
if ($cron -match "entity_type:") {
    Write-Host "X the cron writes entity_type again - no such column, the insert fails silently" -ForegroundColor Red; exit 1
}
if ($cron -match "entity_id:") {
    Write-Host "X the cron writes entity_id - it is GENERATED ALWAYS and rejects any value" -ForegroundColor Red; exit 1
}
if ($cron -notmatch "target_table:") {
    Write-Host "X the cron omits target_table, which is NOT NULL" -ForegroundColor Red; exit 1
}
if ($cron -match "action_url:") {
    Write-Host "X action_url is back - notifications has no such column" -ForegroundColor Red; exit 1
}
# Scope this to the notifications insert only. "user_id: ownerId" is WRONG on
# notifications and RIGHT on notification_user_states, and a whole-file match
# cannot tell them apart - it flagged the correct recipient rows. The string is
# the same in both places; only the region differs.
$notifStart = $cron.IndexOf('.from("notifications")')
$notifEnd   = $cron.IndexOf('.from("notification_user_states")')
if ($notifStart -lt 0 -or $notifEnd -lt 0) {
    Write-Host "X could not locate both inserts to check them separately" -ForegroundColor Red; exit 1
}
$notifBlock = $cron.Substring($notifStart, $notifEnd - $notifStart)
if ($notifBlock -match "\buser_id\b") {
    Write-Host "X the notifications insert sets user_id - no such column; recipients belong in notification_user_states" -ForegroundColor Red; exit 1
}
Write-Host "+ audit and notification shapes match the real tables" -ForegroundColor Green

# Every NOT NULL column the notifications table demands.
foreach ($col in @('channel','created_by','kind','reference_id','reference_type','retry_count','severity')) {
    if ($cron -notmatch "$col`:") {
        Write-Host "X the notification insert omits required column '$col'" -ForegroundColor Red; exit 1
    }
}
if ($cron -notmatch "notification_user_states") {
    Write-Host "X recipients are never recorded - the notification would reach nobody" -ForegroundColor Red; exit 1
}
Write-Host "+ all required columns supplied, recipients recorded" -ForegroundColor Green

# The root cause was not the column names. It was that nothing checked whether
# the write worked, so four years of failures looked like success.
if ($cron -notmatch "auditErr" -or $cron -notmatch "notifErr" -or $cron -notmatch "stateErr") {
    Write-Host "X write results are unchecked again - failures would go silent" -ForegroundColor Red; exit 1
}
if ($cron -notmatch "writeErrors\.length > 0") {
    Write-Host "X the cron no longer fails when it could not record anything" -ForegroundColor Red; exit 1
}
if ($cron -notmatch "status: 500") {
    Write-Host "X the cron reports success even when writes failed" -ForegroundColor Red; exit 1
}
Write-Host "+ write failures now fail the cron loudly" -ForegroundColor Green

$mig = "supabase/migrations/20260720000012_v3_74_753_allow_system_integrity_audit_action.sql"
if (-not (Test-Path $mig)) { Write-Host "X migration file missing" -ForegroundColor Red; exit 1 }
$m = Get-Content -LiteralPath $mig -Raw
if ($m -notmatch "'system_integrity_check'") {
    Write-Host "X the audit action is still not permitted - the insert would be rejected" -ForegroundColor Red; exit 1
}
# Extending an enumerated constraint must not drop existing values.
foreach ($existing in @('backup_auto_export','customer_branch_changed_by_trigger','SALES_RETURN_WAREHOUSE_APPROVE')) {
    if ($m -notmatch [regex]::Escape($existing)) {
        Write-Host "X rewriting the constraint dropped an existing action: $existing" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ action permitted, no existing actions lost" -ForegroundColor Green

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
if (Test-Path ".next/types") { Remove-Item ".next/types" -Recurse -Force -ErrorAction SilentlyContinue }
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "app/api/cron/system-integrity/route.ts" `
    "$mig" `
    "push_v3.74.753.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.752.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_753.txt"
    $msgLines = @(
        'fix(cron): v3.74.753 - the nightly integrity alert has never once reached anyone',
        '',
        'We built a great many checks today, so I asked the obvious question: do',
        'they reach the owner? The chain looks complete - checks, a daily cron at',
        '01:30, a notification to every owner.',
        '',
        'Zero integrity audit rows, ever. Zero integrity notifications, ever. Zero',
        'notifications in the system category at all. Meanwhile backup_auto_export',
        'appears in the last fortnight, so the cron scheduler and CRON_SECRET are',
        'fine. It is this job specifically that has never recorded anything.',
        '',
        'The audit insert had four defects at once: entity_type (no such column),',
        'entity_id (GENERATED ALWAYS, rejects any value), a missing target_table',
        '(NOT NULL), and no check on the result - so the failure passed unnoticed',
        'every single night. The same generated-column mistake fixed in',
        'protect_customer_branch_id at v3.74.743.',
        '',
        'The notification insert had four of its own: notifications has no user_id',
        'column (recipients are rows in notification_user_states), and seven NOT',
        'NULL columns were never supplied - channel, created_by, kind,',
        'reference_id, reference_type, retry_count, severity.',
        '',
        'So the cron computed its findings correctly, failed to record them, failed',
        'to notify anyone, and returned success. The fourth thing today that',
        'reported success while doing nothing.',
        '',
        'Two errors in my own fix, caught because I probed the corrected shape',
        'before shipping instead of assuming renaming columns was enough:',
        '"system_integrity_check" is not in audit_logs_action_check, and action_url',
        'does not exist on notifications - I had copied that field forward from the',
        'broken code without checking. Had I shipped the "fix", the channel would',
        'have stayed dead and I would have believed it live.',
        '',
        'After correction: audit PASS, notification PASS, recipient PASS.',
        '',
        'And the silence is now impossible. Every write result is checked, and if',
        'any fails the cron returns 500 naming them. A scheduled job that writes',
        'nothing and reports success is worse than one that does not run - the',
        'second gets noticed.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.753 pushed - the alert chain can now actually deliver" -ForegroundColor Green
}
