$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.331.ps1") { Remove-Item -LiteralPath "push_v3.74.331.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.332"') {
    Write-Host "+ 3.74.332" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
foreach ($n in @(
    'v3.74.332 — also refresh userBranchAccess state in place',
    'setUserBranchAccess(prev =>',
    "id: 'local-' + Date.now()"
)) {
    if ($page -notmatch [regex]::Escape($n)) {
        Write-Host "X users page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ users page: userBranchAccess mirrored on save" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
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
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_332.txt"
    $msgLines = @(
        'fix(users): v3.74.332 - branch row refreshes on "بدون فرع" save',
        '',
        'Owner reported that picking a regular branch for any user',
        'updated the row in the table immediately, but switching a',
        'booking_officer to "عدم الربط بفرع" left the old branch name',
        'showing until the page was reloaded.',
        '',
        'Root cause was in the local-state mirror, not realtime.',
        'getMemberBranchNames() reads from the userBranchAccess state',
        'first and only falls back to member.branch_id if no active',
        'access row exists for that user. saveMemberBranches updated',
        '  setMembers(...)         <- correct',
        '  user_branch_access      <- DB only (deactivated all rows)',
        'but never touched setUserBranchAccess(), so the stale local',
        'rows kept rendering the old branch name. When effectiveBranchId',
        'was non-null the bug was hidden because the renderer also tried',
        'member.branch_id which had the new value.',
        '',
        'Fix: after the DB writes succeed, mirror the deactivation',
        'locally. Drop every userBranchAccess row for the edited user,',
        'then push back a single fresh row when effectiveBranchId is',
        'set. A NULL save leaves the user with zero rows, falls through',
        'to member.branch_id (now also NULL), and the table prints',
        '"غير محدد".',
        '',
        'Files',
        '  app/settings/users/page.tsx',
        '  lib/version.ts -> 3.74.332'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.332 pushed" -ForegroundColor Green
}
