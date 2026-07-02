$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.502.ps1") { Remove-Item -LiteralPath "push_v3.74.502.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.503"') {
    Write-Host "+ 3.74.503" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ap = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($ap -match 'suppliers\(name\)[\s\S]{0,200}from\("payments"\)' -or $ap -match 'from\("payments"\)[\s\S]{0,400}suppliers\(name\)') {
    Write-Host "X payments query still embeds suppliers(name) - no FK exists" -ForegroundColor Red; exit 1
}
if ($ap -notmatch 'paySupMap' -or $ap -notmatch 'histSupMap') {
    Write-Host "X payments supplier-name second-pass fetch missing" -ForegroundColor Red; exit 1
}
Write-Host "+ payments queues fetch supplier/bill names without FK embeds" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_503.txt"
    $msgLines = @(
        'fix(approvals): v3.74.503 - payments queue: drop embeds with no FK',
        '',
        'Follow-up to v3.74.502. The one remaining 400 on /approvals:',
        'payments has NO foreign key to suppliers or bills, so the',
        'PostgREST embeds suppliers(name) / bills(bill_number) can never',
        'resolve ("could not find a relationship").',
        '',
        'Pending inbox + history now select plain supplier_id / bill_id',
        'and batch-fetch the display names in a second query (IN-list).',
        'branches(name) / warehouses(name) embeds stay - those FKs exist.',
        '',
        'Files',
        '  app/approvals/page.tsx',
        '  lib/version.ts -> 3.74.503'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.503 pushed - approvals inbox fully clean" -ForegroundColor Green
}
