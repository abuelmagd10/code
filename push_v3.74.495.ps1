$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.494.ps1") { Remove-Item -LiteralPath "push_v3.74.494.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.495"') {
    Write-Host "+ 3.74.495" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260702000495_v3_74_495_banner_item_details.sql")) {
    Write-Host "X migration 495 missing" -ForegroundColor Red; exit 1
}

$comp = Get-Content -LiteralPath "components/bills/BillAmendmentBanner.tsx" -Raw
if ($comp -notmatch 'ChangedItem' -or $comp -notmatch 'بنود معدلة') {
    Write-Host "X banner missing per-item detail" -ForegroundColor Red; exit 1
}
Write-Host "+ banner spells out added/removed/modified items" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_495.txt"
    $msgLines = @(
        'feat(banner): v3.74.495 - amendment banner spells out every item edit',
        '',
        'Owner spotted: the bill/invoice amendment banner said "1 modified"',
        'without saying which item or what changed, while the /approvals',
        'DiffCard showed "VitaSlims: qty 4->5" in full.',
        '',
        'AmendmentInfo now stores full added/removed/changed lists',
        'instead of counters. The banner renders each item under its',
        'section with qty x price + discount%, and for modified items',
        'shows exactly which fields moved (qty, price, discount%).',
        '',
        'BillAmendmentBanner is used by both /bills/[id] and /invoices/[id]',
        '(kind="invoice"), so sales inherits the same detail.',
        '',
        'Files',
        '  supabase/migrations/20260702000495_v3_74_495_banner_item_details.sql',
        '  components/bills/BillAmendmentBanner.tsx',
        '  CONTRACTS.md (Section CP added)',
        '  lib/version.ts -> 3.74.495'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.495 pushed - banner shows full item detail" -ForegroundColor Green
}
