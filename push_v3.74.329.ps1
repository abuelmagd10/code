$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.328.ps1") { Remove-Item -LiteralPath "push_v3.74.328.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.329"') {
    Write-Host "+ 3.74.329" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/settings/users/page.tsx" -Raw
foreach ($n in @(
    'editingMemberRole',
    'const NO_BRANCH = "__NONE__"',
    'v3.74.329 — booking_officer may legitimately have NO branch',
    "editingMemberRole === 'booking_officer'",
    'عدم الربط بفرع',
    'مسؤول حجز بدون فرع'
)) {
    if ($page -notmatch [regex]::Escape($n)) {
        Write-Host "X users page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ users page: 'بدون فرع' option wired for booking_officer" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_329.txt"
    $msgLines = @(
        'feat(users): v3.74.329 - "بدون فرع" branch option for booking officers',
        '',
        'The owner asked for the branch dropdown in the company-members',
        'card on /settings/users to show an extra "عدم الربط بفرع"',
        'option, but ONLY when the member being edited is a',
        'booking_officer. Every other role keeps the existing',
        'mandatory single-branch behaviour.',
        '',
        'This pairs with the RLS work in v3.74.324 and v3.74.328:',
        '   * v3.74.324 already made the bookings RLS treat a booking',
        '     officer with no branch as a company-wide reader.',
        '   * v3.74.328 did the same on customers — see every customer',
        '     in the company when company_members.branch_id IS NULL.',
        '',
        'The dialog now uses a "__NONE__" sentinel for the unassigned',
        'choice. saveMemberBranches translates it to NULL before',
        'writing to company_members, and skips the user_branch_access',
        'upsert (that table requires a non-null branch_id).',
        '',
        'Validation relaxed for booking_officer only — every other',
        'role still throws the "يجب تحديد فرع واحد إلزاميًا" toast on a',
        'missing branch.',
        '',
        'No DB migration; everything is UI + state on company_members.',
        'branch_id which is already nullable.',
        '',
        'Files',
        '  app/settings/users/page.tsx',
        '  lib/version.ts -> 3.74.329'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.329 pushed" -ForegroundColor Green
}
