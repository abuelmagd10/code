# v3.65.3 - 3 new roles end-to-end (sidebar labels + invite email + permissions)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Verify markers ===" -ForegroundColor Cyan
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.65.3"') { Write-Host "+ APP_VERSION = 3.65.3" -ForegroundColor Green }
else { Write-Host "X APP_VERSION not 3.65.3" -ForegroundColor Red; exit 1 }

$sb = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sb -match 'مسؤول التصنيع' -and $sb -match 'مسؤول الحجوزات' -and $sb -match 'مسؤول المشتريات') {
    Write-Host "+ sidebar: 3 new Arabic labels added" -ForegroundColor Green
} else { Write-Host "X sidebar labels missing" -ForegroundColor Red; exit 1 }

$inv = Get-Content -LiteralPath "app/api/send-invite/route.ts" -Raw
if ($inv -match 'مسؤول التصنيع' -and $inv -match 'مسؤول الحجوزات' -and $inv -match 'مسؤول المشتريات') {
    Write-Host "+ send-invite: email role mapping updated" -ForegroundColor Green
} else { Write-Host "X send-invite mapping not updated" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host ($tsc | Out-String) -ForegroundColor Red; exit 1 }
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts components/sidebar.tsx app/api/send-invite/route.ts CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(roles): v3.65.3 - 3 new roles end-to-end

After v3.65.2 the three new roles (manufacturing_officer,
booking_officer, purchasing_officer) were only half-supported.
Invitees got stuck in a loop because:

1. company_role_permissions_role_check_v2 (a third CHECK constraint
   I missed) rejected permission rows for the new roles. Cascade
   that seeds permissions silently failed -> empty allowed_pages
   -> AccessContext re-fetched in a tight loop. Fixed via migration.
2. No seed permissions existed for the new roles. Seeded for the
   test company by copying accountant -> purchasing_officer and
   staff -> manufacturing_officer / booking_officer.
3. components/sidebar.tsx role->label map was missing the three.
   Sidebar showed raw English 'purchasing_officer' next to the
   user's name. Added the three Arabic labels.
4. app/api/send-invite/route.ts roleName for the email template
   defaulted everything unknown to 'موظف'. Invitees got emails
   saying their role was wrong. Replaced with explicit mapping
   for all 10 roles + fallback.

Lesson: adding a role is a 6-place change, not 1:
  - 3 CHECK constraints
  - seed permissions for every company
  - sidebar Arabic label
  - invite email Arabic roleName

Files:
  Modified: components/sidebar.tsx
  Modified: app/api/send-invite/route.ts
  Modified: lib/version.ts (3.65.1 -> 3.65.3)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.65.3 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Tell invitee to hard-refresh (Ctrl+Shift+R) after deploy." -ForegroundColor Cyan
}
