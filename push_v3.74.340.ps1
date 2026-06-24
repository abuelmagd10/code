$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.339.ps1") { Remove-Item -LiteralPath "push_v3.74.339.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.340"') {
    Write-Host "+ 3.74.340" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$sf = Get-Content -LiteralPath "components/services/ServiceForm.tsx" -Raw
foreach ($n in @(
    'v3.74.340 — strict: until a branch is chosen',
    'v3.74.340 — Branch first, ALWAYS',
    'v3.74.340 — locked until a branch is chosen',
    'const branchPicked = !!watchedServiceBranchId',
    "اختر الفرع أولاً علشان نعرضلك أصناف"
)) {
    if ($sf -notmatch [regex]::Escape($n)) {
        Write-Host "X ServiceForm missing: $n" -ForegroundColor Red; exit 1
    }
}
# Branch FormField must appear BEFORE Catalog FormField
$branchIdx = $sf.IndexOf('name={"branch_id" as any}')
$catalogIdx = $sf.IndexOf('name={"product_catalog_id" as any}')
if ($branchIdx -lt 0 -or $catalogIdx -lt 0 -or $branchIdx -gt $catalogIdx) {
    Write-Host "X Branch field must come BEFORE Catalog field in the form" -ForegroundColor Red; exit 1
}
Write-Host "+ ServiceForm: branch-first order, catalog locked until branch picked" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_340.txt"
    $msgLines = @(
        'fix(services): v3.74.340 - branch first, catalog locked until picked',
        '',
        'Owner caught it on first test: as owner / general manager,',
        'opening /services/new showed the catalog dropdown populated and',
        'pickable before any branch was chosen. That matches the old',
        'flow but contradicts the scenario the owner wrote up — branch',
        'has to come first so the catalog can be scoped to it.',
        '',
        'Two changes on the form:',
        '',
        '1) Re-ordered the inputs',
        '   Branch FormField moved above the Product-Catalog FormField',
        '   inside the Basic Info tab. The form now reads top-to-bottom',
        '   in the order the owner thinks: pick a branch -> pick a',
        '   catalog item -> set service details. The old branch block',
        '   that was sitting below the catalog preview is gone.',
        '',
        '2) Catalog dropdown locked + empty until branch is set',
        '   Watch effect: if watchedServiceBranchId is null we now set',
        '   catalogProducts back to [] and DON''T fire the /api/products',
        '   fetch. The previous build fell back to an unfiltered list,',
        '   which is exactly what the owner did not want.',
        '   The Select itself is disabled while no branch is picked,',
        '   the placeholder says "اختر الفرع أولاً", and the helper',
        '   text explains that the list will show items in the chosen',
        '   branch. Branch-scope roles (manager) get their branch auto-',
        '   set on mount so the catalog dropdown becomes usable',
        '   immediately for them too.',
        '',
        'No DB / API changes. UI tweak only — the API endpoint and the',
        'cross-branch guard from v3.74.334 still enforce the rule on',
        'the server side.',
        '',
        'Files',
        '  components/services/ServiceForm.tsx',
        '  lib/version.ts -> 3.74.340'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.340 pushed" -ForegroundColor Green
}
