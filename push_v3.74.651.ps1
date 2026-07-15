$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.650.ps1") { Remove-Item -LiteralPath "push_v3.74.650.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.651"') {
    Write-Host "+ 3.74.651" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.651]")) { Write-Host "X CHANGELOG missing [3.74.651]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$api = Get-Content -LiteralPath "app/api/bookings/calendar/route.ts" -Raw
if ($api -notmatch "isBranchScoped" -or $api -notmatch "staff_name,") { Write-Host "X calendar endpoint fix missing" -ForegroundColor Red; exit 1 }
Write-Host "+ calendar endpoint: role-aware scoping + staff/branch fields" -ForegroundColor Green

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
    "CHANGELOG.md" `
    "app/api/bookings/calendar/route.ts" `
    "components/bookings/CalendarEventCard.tsx" `
    "push_v3.74.651.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.650.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_651.txt"
    $msgLines = @(
        'fix(bookings): v3.74.651 - calendar showed no bookings for company-wide owners',
        '',
        '- /api/bookings/calendar used if(member.branch_id) scoping (same bug fixed',
        '  on the table): an owner assigned to one branch could not see other',
        '  branches. Now uses role-aware isBranchScoped.',
        '- Endpoint returns staff_name + branch_name and no longer hides',
        '  cancelled/no_show (calendar now matches the table).',
        '- Event card shows staff name and derives outstanding from total - paid.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.651 pushed - calendar now shows bookings across branches" -ForegroundColor Green
}
