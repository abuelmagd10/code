$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.688.ps1") { Remove-Item -LiteralPath "push_v3.74.688.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.689"') {
    Write-Host "+ 3.74.689" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.689]")) { Write-Host "X CHANGELOG missing [3.74.689]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# Governance guard must scope purchasing_officer by branch (not the admin group).
$gov = Get-Content -LiteralPath "lib/governance-middleware.ts" -Raw
if ($gov -notmatch "case 'purchasing_officer'") { Write-Host "X purchasing_officer branch case missing" -ForegroundColor Red; exit 1 }
Write-Host "+ purchasing_officer is branch-scoped in governance" -ForegroundColor Green

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
    "lib/governance-middleware.ts" `
    "app/api/v2/purchase-orders/route.ts" `
    "app/purchase-orders/page.tsx" `
    "push_v3.74.689.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.688.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_689.txt"
    $msgLines = @(
        'fix(security): v3.74.689 - branch-scope purchasing officer + close PO cross-branch leaks',
        '',
        '- governance-middleware: purchasing_officer is now branch-scoped when it',
        '  has a branch (central/no-branch keeps company-wide). Was grouped with',
        '  admin (cross-branch always), leaking other branches documents.',
        '- api/v2/purchase-orders: fail-closed when a non-privileged user has no',
        '  branch scope (previously showed all branches).',
        '- purchase-orders page: realtime onInsert now respects branch isolation',
        '  instead of injecting any newly-created PO into every user list.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.689 pushed - purchasing officer branch isolation" -ForegroundColor Green
}
