# v3.74.16 - fix notification re-fire on workflow resubmission
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.16"') { Write-Host "+ APP_VERSION = 3.74.16" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.16" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.16\]' -and $cl -match 'create_notification') {
    Write-Host "+ CHANGELOG entry for 3.74.16 present" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.16" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(notifications): v3.74.16 - re-fire on workflow resubmission

Ahmed reported: an employee creates an expense -> admin gets a
notification -> admin rejects -> employee resubmits -> NO notification
reaches the admin the second time. Same flaw affects all 17+ workflows
that use create_notification with a deterministic event_key.

Root cause:

  create_notification(p_event_key) deduplicates by event_key. Each
  workflow generates a constant event_key per (record, approver) pair
  e.g.   expense:<id>:pending_approval:<approverUser>

  The function returned the existing notification whenever it found
  any row with status != 'archived'. After the admin OPENED the
  notification its status became 'read' (not archived). So on
  resubmission, the function found the read row, returned its ID,
  and inserted nothing. Silent dropout.

  Compounded by a hard UNIQUE INDEX on (company_id, event_key) that
  would have blocked any second insert anyway.

Fix (DB-only, application code untouched):

  1) Replaced the strict unique index with a partial one:
       CREATE UNIQUE INDEX uniq_notifications_active_event_key
       ON notifications (company_id, event_key)
       WHERE event_key IS NOT NULL AND status = 'unread';
     Preserves the 'no two unread with same event_key' guarantee
     (race conditions / double-clicks) while letting a 'read' or
     'actioned' row coexist with a NEW 'unread' row.

  2) Rewrote create_notification():
       - Dedup ONLY against status='unread'.
       - If a prior notification exists with status IN ('read',
         'actioned'), archive it before inserting the fresh row.
         Keeps inbox clean: one active notification per workflow
         stage at a time.
       - Race-condition EXCEPTION handler preserved.

Verified end-to-end with a 5-step smoke test inside a DO block:
  1. First submit              -> id A
  2. Immediate retry           -> id A (dedup ok)
  3. Mark notification as read
  4. Resubmit                  -> id B (NEW, the bug)
  5. Retry                     -> id B (dedup ok)
  Old id A status is now 'archived' (auto-cleanup).

Why DB-level instead of per-workflow:
  17+ workflows follow the same pattern. Fixing each call site is
  17+ edits, 17+ chances to miss one, and 17+ chances for future
  workflows to introduce the same bug. Fixing it at create_notification
  catches everything existing AND every workflow added in the future,
  with zero application-code changes.

Files:
  DB: v3_74_16_notification_resubmit_fix
      v3_74_16_notification_resubmit_fix_v2 (column-name correction)
  Modified: lib/version.ts (3.74.15 -> 3.74.16)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.16 pushed" -ForegroundColor Green
}
