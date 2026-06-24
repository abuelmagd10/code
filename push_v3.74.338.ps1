$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.337.ps1") { Remove-Item -LiteralPath "push_v3.74.337.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.338"') {
    Write-Host "+ 3.74.338" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$sf = Get-Content -LiteralPath "components/services/ServiceForm.tsx" -Raw
if ($sf -notmatch [regex]::Escape('v3.74.338 — removed the separate search input')) {
    Write-Host "X ServiceForm: missing v3.74.338 marker" -ForegroundColor Red; exit 1
}
# old search input must be gone
if ($sf -match 'value=\{catalogQuery\}') {
    Write-Host "X ServiceForm: catalogQuery search input still present" -ForegroundColor Red; exit 1
}
if ($sf -match 'filteredCatalog') {
    Write-Host "X ServiceForm: stale filteredCatalog reference still present" -ForegroundColor Red; exit 1
}
Write-Host "+ ServiceForm: duplicate catalog search removed" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_338.txt"
    $msgLines = @(
        'fix(ui): v3.74.338 - drop duplicate search field in catalog picker',
        '',
        'Owner spotted the catalog name being rendered twice on top of',
        'each other in /services/new: once in the search Input and once',
        'in the Select trigger. The two looked like a duplicate field',
        'even though they were doing different jobs.',
        '',
        'Removed the separate type="search" Input that was sitting',
        'above the dropdown. The Select is enough on its own: the list',
        'is already filtered to the chosen branch (v3.74.333) and is',
        'normally short. Dropped the catalogQuery state and the',
        'filteredCatalog memo that backed it.',
        '',
        'Also clarified the empty-state Arabic copy:',
        '"لا توجد أصناف خدمات لهذا الفرع. أنشئ صنفاً من نوع «خدمة» فى',
        '«المنتجات والخدمات» أولاً." — the previous wording made it',
        'sound like there was no service catalog at all.',
        '',
        'No DB / API changes. UI tweak only.',
        '',
        'Files',
        '  components/services/ServiceForm.tsx',
        '  lib/version.ts -> 3.74.338'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.338 pushed" -ForegroundColor Green
}
