$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.335.ps1") { Remove-Item -LiteralPath "push_v3.74.335.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.336"') {
    Write-Host "+ 3.74.336" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ssm = Get-Content -LiteralPath "components/services/ServiceStaffManager.tsx" -Raw
foreach ($n in @(
    'v3.74.336 — multi-select',
    'import { MultiSelect } from "@/components/ui/multi-select"',
    'selectedUserIds',
    'v3.74.336 — add a batch of employees',
    'اختر موظف أو أكثر',
    'اختر أكتر من موظف للإضافة دفعة واحدة'
)) {
    if ($ssm -notmatch [regex]::Escape($n)) {
        Write-Host "X ServiceStaffManager missing: $n" -ForegroundColor Red; exit 1
    }
}
# old single-select must be gone
if ($ssm -match 'selectedUserId, setSelectedUserId') {
    Write-Host "X old single-select state still present" -ForegroundColor Red; exit 1
}
Write-Host "+ ServiceStaffManager: multi-select wired" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_336.txt"
    $msgLines = @(
        'feat(services): v3.74.336 - multi-select staff picker',
        '',
        'Owner asked for the staff picker on a service to behave like the',
        'multi-select dropdown already used elsewhere in the project. The',
        'old picker added one employee at a time; if the owner wanted to',
        'assign five people to a service, they had to open the dropdown',
        'five times.',
        '',
        'ServiceStaffManager now uses the existing components/ui/',
        'multi-select. Owner can search, tick several names, then click',
        '"Add 5" once. The handler POSTs each picked user_id through the',
        'existing single-employee endpoint and reports a friendly toast',
        '(e.g. "5 staff added" or "4 added, 1 failed - Salma: ...").',
        '',
        'The hint under the picker spells out the open-queue rule that',
        'matches the booking-side filter (v3.74.337/338):',
        '"Leave empty to keep the service open to every employee in the',
        'branch."',
        '',
        'is_primary is intentionally NOT exposed in multi-add (it only',
        'makes sense for a single row). Existing rows still show the',
        'Primary badge and the per-row delete button continues to work',
        '(v3.74.333 fix).',
        '',
        'No DB migration. The endpoint, RLS and the cross-branch guard',
        'from v3.74.334 are all reused as-is.',
        '',
        'Files',
        '  components/services/ServiceStaffManager.tsx',
        '  lib/version.ts -> 3.74.336'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.336 pushed" -ForegroundColor Green
}
