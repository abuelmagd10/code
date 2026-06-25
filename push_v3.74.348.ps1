$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.347.ps1") { Remove-Item -LiteralPath "push_v3.74.347.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.348"') {
    Write-Host "+ 3.74.348" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- ServicesTable has the new branch column --------------------------------
$tbl = Get-Content -LiteralPath "components/services/ServicesTable.tsx" -Raw
foreach ($n in @(
    'v3.74.348 — Branch column',
    'branchesMap?: Record<string',
    "key: ""branch_id""",
    'branchesMap[row.branch_id]'
)) {
    if ($tbl -notmatch [regex]::Escape($n)) {
        Write-Host "X ServicesTable missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ ServicesTable: branch column" -ForegroundColor Green

# ---- /services page wires the filter ----------------------------------------
$pg = Get-Content -LiteralPath "app/services/page.tsx" -Raw
foreach ($n in @(
    'v3.74.348 — branch filter respects the user',
    'const [branchFilter, setBranchFilter]',
    'v3.74.348 — branches list for the filter + table column',
    'fetch("/api/branches")',
    'params.set("branch_id", branchFilter)',
    'disabled={!isCompanyScope && !!userBranchId}',
    'branchesMap={branchesMap}'
)) {
    if ($pg -notmatch [regex]::Escape($n)) {
        Write-Host "X services page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ services page: branch filter dropdown" -ForegroundColor Green

# ---- type-check --------------------------------------------------------------
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

# ---- commit + push -----------------------------------------------------------
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_348.txt"
    $msgLines = @(
        'feat(services): v3.74.348 - branch column and branch filter on /services',
        '',
        'Owner asked for the booking services page to show which branch',
        'every service belongs to, and for the existing filter strip to',
        'include a branch picker.',
        '',
        'Change',
        '  - ServicesTable: new "الفرع" column rendered with a small map',
        '    pin icon. Falls back to "—" for the rare legacy row with',
        '    NULL branch_id; new services force a branch since v3.74.319.',
        '  - /services page: fetches /api/branches, builds a branchesMap',
        '    by id and passes it to the table.',
        '  - /services page: new branch dropdown in the FilterContainer.',
        '    Owner / admin see "كل الفروع" + every branch and can pick',
        '    freely. Branch-scope users (manager, store_manager, etc.)',
        '    have their own branch auto-selected on mount and the picker',
        '    is disabled. RLS enforces the same scope server-side, so',
        '    the disabled control is purely visual.',
        '  - clearFilters resets the filter to "all" for company-scope',
        '    users and back to the pinned branch for branch-scope users.',
        '  - activeFilterCount only counts the branch filter when a',
        '    company-scope user picked something specific, so the badge',
        '    does not flash on branch-scope users by default.',
        '',
        'Files',
        '  components/services/ServicesTable.tsx',
        '  app/services/page.tsx',
        '  lib/version.ts -> 3.74.348'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.348 pushed" -ForegroundColor Green
}
