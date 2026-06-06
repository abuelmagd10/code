# v3.74.66 - permission-transfer notification fixes
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.66"') {
    Write-Host "+ APP_VERSION = 3.74.66" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.66" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.66]')) {
    Write-Host "+ CHANGELOG 3.74.66" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.66" -ForegroundColor Red; exit 1 }

$route = Get-Content -LiteralPath "app/api/permissions/transfer/route.ts" -Raw
if ($route -match 'assigned_to_user: approverId' -and $route -match 'uid !== user\.id') {
    Write-Host "+ transfer route excludes submitter via assigned_to_user" -ForegroundColor Green
} else { Write-Host "X transfer route missing per-user wiring" -ForegroundColor Red; exit 1 }

$routing = Get-Content -LiteralPath "lib/notification-routing.ts" -Raw
if ($routing -match "'permission_transfer'") {
    Write-Host "+ permission_transfer route registered" -ForegroundColor Green
} else { Write-Host "X permission_transfer route missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check (focused) ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$relevant = $tsc | Select-String "(permissions/transfer/route|notification-routing)"
if ($relevant.Count -eq 0) {
    Write-Host "+ touched files: 0 errors" -ForegroundColor Green
} else {
    Write-Host "X touched files have errors:" -ForegroundColor Red
    $relevant | Select-Object -First 5
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(permissions): v3.74.66 - submitter no longer self-notifies + notif route fixed

Two bugs in the permission-transfer notification flow:

1) The submitter was getting their own approval request in their inbox.
   The previous code inserted one notification per role (assigned_to_role
   = owner / admin / general_manager), which fanned out to every senior
   - including the submitter, defeating the two-eye rule. Now we fetch
   each approver from company_members, exclude the submitter by user_id,
   and insert one per-user notification (assigned_to_user) for the rest.

2) Clicking the notification showed 'cannot navigate to this notification'
   because permission_transfer was missing from the REFERENCE_TYPE_TO_ROUTE
   table in lib/notification-routing.ts. Added the entry pointing to
   /settings/users?highlight=transfer-<id> so the approver lands on the
   right page.

Backwards-compatible: pending transfers from earlier versions with the
old assigned_to_role still resolve - NotificationCenter reads either
field. New transfers use the per-user form." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.66 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.65.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.65.ps1' -Force
    }
}
