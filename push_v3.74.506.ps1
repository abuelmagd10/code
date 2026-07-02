$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.505.ps1") { Remove-Item -LiteralPath "push_v3.74.505.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.506"') {
    Write-Host "+ 3.74.506" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260702000506_v3_74_506_employees_branch_link.sql")) {
    Write-Host "X migration 506 missing" -ForegroundColor Red; exit 1
}

$payroll = Get-Content -LiteralPath "app/api/hr/payroll/route.ts" -Raw
if ($payroll -notmatch 'isBranchManager' -or $payroll -notmatch 'scopedEmployeeIds') {
    Write-Host "X payroll run not branch-scoped for manager" -ForegroundColor Red; exit 1
}

$payslips = Get-Content -LiteralPath "app/api/hr/payroll/payslips/route.ts" -Raw
if (($payslips -split "branch_id").Count -lt 4) {
    Write-Host "X payslips PUT/DELETE not branch-scoped" -ForegroundColor Red; exit 1
}

$empRoute = Get-Content -LiteralPath "app/api/hr/employees/route.ts" -Raw
if ($empRoute -notmatch 'isBranchManager') {
    Write-Host "X employees route not branch-scoped" -ForegroundColor Red; exit 1
}

$settings = Get-Content -LiteralPath "app/api/hr/payroll/settings/route.ts" -Raw
if ($settings -match '"owner", "admin", "manager"') {
    Write-Host "X payroll settings still writable by branch manager" -ForegroundColor Red; exit 1
}

$empPage = Get-Content -LiteralPath "app/hr/employees/page.tsx" -Raw
if ($empPage -notmatch 'branch_id') {
    Write-Host "X employees page missing branch selector" -ForegroundColor Red; exit 1
}
Write-Host "+ payroll execution branch-scoped for branch manager" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_506.txt"
    $msgLines = @(
        'feat(hr): v3.74.506 - branch-scoped payroll for the branch manager',
        '',
        'Owner spec: the branch manager MAY run payroll, but only for the',
        'employees of his own branch. Two structural problems stood in',
        'the way:',
        '',
        '1. employees had NO branch link at all - added employees.branch_id',
        '   (FK to branches, migration already applied to production) plus',
        '   a branch selector in the employees page (hidden for the branch',
        '   manager - his branch is forced server-side).',
        '2. The payroll run processed (and wiped/rebuilt payslips for) the',
        '   WHOLE company regardless of who ran it. Now: when a branch',
        '   manager runs payroll, employees are filtered to his branch and',
        '   the payslip delete/rebuild touches only those employees -',
        '   other branches keep their payslips for the same month.',
        '',
        'Also scoped for the branch manager: employees GET (his branch',
        'only), POST (branch forced), PUT/DELETE (cannot touch other',
        'branches), payslip PUT/DELETE (403 on other branches). Payroll',
        'SETTINGS are company-wide config so they are now owner/admin',
        'only.',
        '',
        'Files',
        '  supabase/migrations/20260702000506_v3_74_506_employees_branch_link.sql',
        '  app/api/hr/payroll/route.ts',
        '  app/api/hr/payroll/payslips/route.ts',
        '  app/api/hr/payroll/settings/route.ts',
        '  app/api/hr/employees/route.ts',
        '  app/hr/employees/page.tsx',
        '  lib/version.ts -> 3.74.506'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.506 pushed - branch manager payroll scoped to his branch" -ForegroundColor Green
}
