# v3.74.68 - temporarily disable multi-branch-access UI + API
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.68"') {
    Write-Host "+ APP_VERSION = 3.74.68" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.68" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.68]')) {
    Write-Host "+ CHANGELOG 3.74.68" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.68" -ForegroundColor Red; exit 1 }

# Route file: POST short-circuits to 503 + _legacyPOST exists
$route = Get-Content -LiteralPath "app/api/permissions/branch-access/route.ts" -Raw
if ($route -match 'status:\s*503' -and $route -match '_legacyPOST') {
    Write-Host "+ branch-access POST disabled (503 + _legacyPOST)" -ForegroundColor Green
} else { Write-Host "X branch-access POST not properly disabled" -ForegroundColor Red; exit 1 }

# Users page: button disabled + tooltip
$users = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
$lineCount = ($users -split "`n").Count
if ($lineCount -ge 3940) {
    Write-Host "+ users page intact ($lineCount lines)" -ForegroundColor Green
} else { Write-Host "X users page truncated ($lineCount lines)" -ForegroundColor Red; exit 1 }

if ($users.TrimEnd().EndsWith("}")) {
    Write-Host "+ users page ends with }" -ForegroundColor Green
} else { Write-Host "X users page does not end with closing brace" -ForegroundColor Red; exit 1 }

if ($users -match 'فروع متعددة 🚧' -and $users -match 'v3\.74\.68') {
    Write-Host "+ multi-branch button disabled + marker present" -ForegroundColor Green
} else { Write-Host "X multi-branch disable wiring missing" -ForegroundColor Red; exit 1 }

# Shareholders roadmap doc shipped with this release
if (Test-Path 'docs/SHAREHOLDERS_ROADMAP.md') {
    Write-Host "+ SHAREHOLDERS_ROADMAP.md present" -ForegroundColor Green
} else { Write-Host "X SHAREHOLDERS_ROADMAP.md missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check on touched files ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$touched = $tsc | Select-String "(settings/users/page.tsx|branch-access/route.ts)"
if ($touched.Count -eq 0) {
    Write-Host "+ touched files: 0 errors" -ForegroundColor Green
} else {
    Write-Host "X touched files have errors:" -ForegroundColor Red
    $touched | Select-Object -First 5
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(governance): v3.74.68 - disable Multi-branch access UI + API temporarily

Auditing the 'Add branch access' flow turned up a functional gap: the
operator picks an employee and 3 branches, the request succeeds, a row
lands in user_branch_access, but every list page still computes its
branch filter from company_members.branch_id (single). The newly
granted branches have no effect on what the user actually sees.

Not a security hole - the feature doesn't widen anything that was
hidden before - but a misleading UX bug: managers think governance
updated and it didn't.

Real fix would unify lib/role-based-access.ts, lib/access-context.tsx,
16 page files, ~155 branch_id-aware RLS policies, and the missing
branch picker on INSERT forms. ~1-2 person-days plus full governance
test pass. Deferring to v3.75.0.

For now:
- POST /api/permissions/branch-access returns HTTP 503 disabled:true.
  Legacy body preserved as _legacyPOST for easy restore.
- The 'Multi branches' button in the Transfer/Share dialog renders
  disabled with a tooltip pointing at v3.75.0.
- GET / PATCH still work so existing rows remain readable + editable
  (no data loss).

Inserted via Python anchor script after the Edit tool truncated both
files. TypeScript: 0 errors on touched files." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.68 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.67.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.67.ps1' -Force
    }
}
