# v3.74.64 - HOTFIX: restore truncated users page from v3.74.62 + reapply v3.74.63 wiring cleanly
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") {
    Remove-Item ".git/index.lock" -Force
    Write-Host "  (removed stale .git/index.lock)" -ForegroundColor DarkGray
}

Write-Host "=== Verify markers ===" -ForegroundColor Cyan

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.64"') {
    Write-Host "+ APP_VERSION = 3.74.64" -ForegroundColor Green
} else { Write-Host "X APP_VERSION not 3.74.64" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.64]')) {
    Write-Host "+ CHANGELOG 3.74.64" -ForegroundColor Green
} else { Write-Host "X CHANGELOG missing 3.74.64" -ForegroundColor Red; exit 1 }

# Verify file is NOT truncated and ends with closing brace
$users = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
$lineCount = ($users -split "`n").Count
if ($lineCount -ge 3895) {
    Write-Host "+ users page intact ($lineCount lines)" -ForegroundColor Green
} else { Write-Host "X users page truncated ($lineCount lines)" -ForegroundColor Red; exit 1 }

$trimmed = $users.TrimEnd()
if ($trimmed.EndsWith("}")) {
    Write-Host "+ users page ends with }" -ForegroundColor Green
} else { Write-Host "X users page does not end with closing brace" -ForegroundColor Red; exit 1 }

# Confirm v3.74.63 markers landed
$markers = ([regex]::Matches($users, 'v3\.74\.63')).Count
if ($markers -ge 4) {
    Write-Host "+ v3.74.63 wiring present ($markers markers)" -ForegroundColor Green
} else { Write-Host "X v3.74.63 wiring incomplete ($markers markers)" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check on users page ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$userErrors = ($tsc | Select-String "settings/users/page.tsx").Count
if ($userErrors -eq 0) {
    Write-Host "+ users page: 0 errors" -ForegroundColor Green
} else {
    Write-Host "X users page has $userErrors errors" -ForegroundColor Red
    $tsc | Select-String "settings/users/page.tsx" | Select-Object -First 5
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(build): v3.74.64 hotfix - restore truncated users page

v3.74.63 was pushed with app/settings/users/page.tsx truncated from
3843 to 3795 lines - the tail ended mid-token (cons instead of const),
breaking the Turbopack build with 'Expected }, got <eof>'. The Edit
tool lost about 50 closing JSX tags when applying the large multi-
select UI block.

Restored from v3.74.62 baseline (commit 6f287c5) and re-applied the
v3.74.63 wiring via surgical anchor-based replacements (no JSX UI
block this round - deferred to v3.74.65):

- State for sourceCustomers / selectedCustomerIds / search query
- Fetch effect for source employee's owned customers
- Submit body now sends customer_ids when hand-picked
- Reset form clears the new state

The server-side intersection in /api/permissions/transfer/route.ts
from v3.74.63 was unaffected and still narrows the snapshot to the
operator's picks.

TypeScript: 0 errors in users/page.tsx (was 11 cascade errors)." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.64 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.63.ps1') {
        Remove-Item -LiteralPath 'push_v3.74.63.ps1' -Force
        Write-Host "  (removed superseded push_v3.74.63.ps1)" -ForegroundColor DarkGray
    }
}
