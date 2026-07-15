$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.647.ps1") { Remove-Item -LiteralPath "push_v3.74.647.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.648"') {
    Write-Host "+ 3.74.648" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/bookings/page.tsx" -Raw
if ($pg -notmatch "isBranchScoped") { Write-Host "X page branch-scoped logic missing" -ForegroundColor Red; exit 1 }
$api = Get-Content -LiteralPath "app/api/bookings/route.ts" -Raw
if ($api -notmatch "const isBranchScoped" -or $api -notmatch "branchId && !isBranchScoped") { Write-Host "X API branch-scoped logic missing" -ForegroundColor Red; exit 1 }
Write-Host "+ branch filter now keys off branch-linkage, not role (unassigned booking officer sees it)" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- `
    "lib/version.ts" `
    "app/bookings/page.tsx" `
    "app/api/bookings/route.ts" `
    "push_v3.74.648.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.647.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_648.txt"
    $msgLines = @(
        'fix(bookings): v3.74.648 - branch filter keys off branch-linkage, not role',
        '',
        '- An unassigned booking officer (no branch_id) now sees the branch filter',
        '  and can browse across branches; a booking officer WITH a branch_id stays',
        '  scoped to their branch (no filter).',
        '- API + page use isBranchScoped = (not company-wide) AND has branch_id.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.648 pushed - branch filter by branch-linkage" -ForegroundColor Green
}
