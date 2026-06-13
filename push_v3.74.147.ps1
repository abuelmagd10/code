$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.146.ps1") { Remove-Item -LiteralPath "push_v3.74.146.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.147"') { Write-Host "+ 3.74.147" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(payments): v3.74.147 - resolve creator/audit names without profiles table

User report: payment details modal showed 'مُنشِئ الدَّفعَة: غَير
مُسَجَّل' and 'مَسار الاعتماد: مُستَخدِم غَير مُحَدَّد' for a payment
the accountant had just recorded, even though the DB had
created_by + changed_by populated with the correct user id.

Root cause: components/payments/PaymentDetailsModal.tsx joined
company_members on a public.profiles table that doesn't exist in
this schema. The Supabase query failed silently and full_name came
back null, so both the 'Created by' row and the audit-log entries
fell through to the 'unknown user' string.

Fix:

  components/payments/PaymentDetailsModal.tsx
    - Replaced 'profile:profiles(full_name)' with a join on
      employees(full_name) (when the member is linked to an HR
      record), plus the member's email as a fallback.
    - Same fix applied to the audit-log user_name resolution.

After this:
  - Creator row shows employee name when available, otherwise the
    member's email (e.g. foodcana1976@gmail.com).
  - Audit-log timeline labels each entry with the same resolution.

Note about 'Notes: —' in the same panel: this is correct behavior.
payments.notes was actually null in the database for this payment
because the accountant didn't enter notes when recording it. The
'—' placeholder is the intentional empty-state display, not a
display bug. No change needed there." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.147 pushed" -ForegroundColor Green
}
