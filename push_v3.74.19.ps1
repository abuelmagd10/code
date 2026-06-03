# v3.74.19 - DB-level invariant: journal entry exists => expense is paid
# Trigger + one-shot backfill (DB migration already applied).
# This release is DB-only; no app code paths were modified.
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.19"') {
    Write-Host "+ APP_VERSION = 3.74.19" -ForegroundColor Green
} else {
    Write-Host "X APP_VERSION not 3.74.19" -ForegroundColor Red; exit 1
}

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match '\[3.74.19\]' -and $cl -match 'expenses_mark_paid_when_journal_added') {
    Write-Host "+ CHANGELOG entry for 3.74.19 present" -ForegroundColor Green
} else {
    Write-Host "X CHANGELOG missing 3.74.19" -ForegroundColor Red; exit 1
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(expenses): v3.74.19 - DB-level invariant journal-exists implies paid

Ahmed reported EXP-0001 (18 May 2026, status approved) showed a
'Record Payment' button while a freshly created EXP-0002 in the
same approved-then-paid flow did not. Diagnosis: EXP-0001 has
journal_entry_id set (the cash-outflow journal was posted) but
status stayed 'approved' and paid_at stayed NULL. This row was
created before v3.26.1 introduced the auto-flip-to-paid logic in
handleApprove. Exactly one such legacy row existed across all
companies.

A one-row backfill would heal the visible bug but leave the
invariant unenforced: any future code path or transient failure
that posts a journal without flipping status would reproduce the
same state. So we promoted the rule to a database-level invariant.

DB changes (migration v3_74_19_expense_auto_paid_invariant):

  (1) BEFORE INSERT/UPDATE trigger on expenses.
      Function: expenses_mark_paid_when_journal_added()
      Fires when journal_entry_id transitions NULL -> NOT NULL
      while status = 'approved' (or on INSERT with both set).
      Rewrites the row in place:
        status                 := 'paid'
        paid_at                := COALESCE(paid_at, approved_at, now())
        paid_by                := COALESCE(paid_by, approved_by)
        last_status_changed_at := now()
      COALESCE everywhere so deliberately-set values are never
      overwritten. The trigger agrees with v3.26.1 handleApprove
      and just guarantees the same result for every other path.

  (2) One-shot backfill of existing inconsistent rows.
      UPDATE every row where status='approved' AND journal_entry_id
      IS NOT NULL AND paid_at IS NULL. Each healed row also gets
      an audit_logs entry with reason
      'v3.74.19 backfill: journal exists -> status=paid invariant'
      so the change is traceable per row.

Post-migration verification:
  - rows in the inconsistent state: 0 (was 1, EXP-0001)
  - trigger trg_expenses_auto_paid_on_journal registered: yes
  - EXP-0001 now status='paid', paid_at=2026-05-18 (matches
    its original approved_at), paid_by populated.
  - EXP-0002 unchanged (already correct).

Why a trigger and not a CHECK constraint: a CHECK would ERROR on
the legacy rows we wanted to heal and on the brief intermediate
state inside handleApprove between the journal insert and the
status flip. The BEFORE trigger silently fixes the row so the
invariant holds at COMMIT without forcing every caller to handle
a constraint violation.

Files:
  DB:       migration v3_74_19_expense_auto_paid_invariant
  Modified: lib/version.ts (3.74.18 -> 3.74.19)
  Modified: CHANGELOG.md

No application code was modified.

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.19 pushed" -ForegroundColor Green
}
