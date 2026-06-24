$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.333.ps1") { Remove-Item -LiteralPath "push_v3.74.333.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.334"') {
    Write-Host "+ 3.74.334" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Service POST: catalog cross-branch guard
$svc = Get-Content -LiteralPath "app/api/services/route.ts" -Raw
foreach ($n in @(
    'v3.74.334 — defense-in-depth: refuse to link a product',
    "صنف الخدمة المختار يخص فرعاً آخر",
    "صنف الـ catalog المختار ليس من نوع",
    'catalogProduct.item_type !== '
)) {
    if ($svc -notmatch [regex]::Escape($n)) {
        Write-Host "X services POST guard missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ services POST: cross-branch + non-service catalog guards" -ForegroundColor Green

# Staff POST: cross-branch employee guard
$staff = Get-Content -LiteralPath "app/api/services/[id]/staff/route.ts" -Raw
foreach ($n in @(
    'v3.74.334 — defense-in-depth: only allow assigning',
    'الموظف المختار من فرع آخر',
    'الموظف غير موجود فى أعضاء الشركة'
)) {
    if ($staff -notmatch [regex]::Escape($n)) {
        Write-Host "X staff POST guard missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ staff POST: cross-branch employee guard wired" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_334.txt"
    $msgLines = @(
        'feat(services): v3.74.334 - Phase 2 - API guards for cross-branch links',
        '',
        'Defense-in-depth layer for the UI guards we shipped in v3.74.333.',
        'A direct curl call or any stale client state could still try to',
        'bypass the dropdown filters and link a product or staff member',
        'from a different branch. These guards stop that at the API.',
        '',
        'POST /api/services',
        '  When body.product_catalog_id is present:',
        '    - Loads the catalog row in the caller''s company.',
        '    - Refuses with 400 if the product is missing / inactive,',
        '      or its item_type is not "service", or its branch_id is',
        '      a different branch than the service we''re creating.',
        '      branch_id IS NULL on the catalog product is fine — that',
        '      means a company-level shared catalog item.',
        '',
        'POST /api/services/[id]/staff',
        '  Now reads the service''s branch_id alongside the existence',
        '  check, then validates the employee being assigned:',
        '    - Must be a member of the same company.',
        '    - Their branch_id must either be NULL or match the',
        '      service''s branch_id. Foreign-branch employees are',
        '      rejected with a friendly Arabic 400 message.',
        '',
        'No DB migration. Both checks live in the API route. RLS still',
        'gates row visibility — the policies have not changed.',
        '',
        'Files',
        '  app/api/services/route.ts',
        '  app/api/services/[id]/staff/route.ts',
        '  lib/version.ts -> 3.74.334'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.334 pushed" -ForegroundColor Green
}
