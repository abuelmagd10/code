# v3.74.17 - time-window notification dedup
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.17"') { Write-Host "+ APP_VERSION = 3.74.17" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.74.17" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.17\]' -and $cl -match '30 seconds') {
    Write-Host "+ CHANGELOG entry for 3.74.17 present" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.17" -ForegroundColor Red; exit 1 }

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
    git commit -m "fix(notifications): v3.74.17 - time-window dedup covers silent-action case

Ahmed reported v3.74.16 didn't actually fix the bug in production:

  1. Employee creates expense
  2. Admin sees badge '1' on Expenses entry
  3. Admin clicks the SIDEBAR ENTRY (not the notification),
     goes to expense page, rejects from there
  4. Original notification status stays 'unread' (admin never
     opened it)
  5. Employee resubmits -> v3.74.16 still dedupes against the
     unread original -> no fresh notification reaches admin

v3.74.16 assumed the recipient would always open the notification
before acting. In real workflows the badge IS the action cue. The
notification stays unread the whole time.

Fix: detect 'fresh event' by AGE, not by status. Rewrote
create_notification() to:

  IF a prior notification with this event_key exists:
    IF unread AND created within last 30 seconds
      -> return existing (race-condition dedup)
    ELSE
      -> archive it (any status), insert fresh notification

The 30-second window is generous for race conditions (typical
resolution: milliseconds) and far below any human re-action
interval. Covers all four scenarios:

  - Quick retry (<30s)                                  -> dedup
  - Resubmit after admin opened notification (read)     -> archive+new
  - Resubmit after admin acted via badge (still unread, -> archive+new
    but old)                                              <- v3.74.16 gap
  - Resubmit after any delay                            -> archive+new

Verified end-to-end with 5-step DB smoke test including the silent-
action scenario where notification stayed unread but workflow record
changed:
  1) First submit                       -> id A
  2) Race retry (<30s, unread)          -> id A   (dedup ok)
  3) Backdate id A by 5 min (unread)
  4) Resubmit                           -> id B   (NEW, was the bug)
  5) Race retry on new                  -> id B   (dedup ok)
  verify id A status                    = 'archived'

Where archived notifications go:
  Already accessible via NotificationCenter -> Status filter ->
  'archived'. Never deleted. Deep-link to the workflow record still
  works. No UI change needed in this release.

Files:
  DB: v3_74_17_time_window_notification_dedup
  Modified: lib/version.ts (3.74.16 -> 3.74.17)
  Modified: CHANGELOG.md

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.17 pushed" -ForegroundColor Green
}
