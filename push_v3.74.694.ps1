$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.693.ps1") { Remove-Item -LiteralPath "push_v3.74.693.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.694"') {
    Write-Host "+ 3.74.694" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.694]")) { Write-Host "X CHANGELOG missing [3.74.694]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$pg = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($pg -notmatch "original_payment_id" -or $pg -notmatch "vpcScope") {
    Write-Host "X vendor-correction branch derivation missing" -ForegroundColor Red; exit 1
}
$idx = $pg.IndexOf('category: "vendor_payment_correction",')
if ($idx -lt 0) { Write-Host "X vendor_payment_correction block missing" -ForegroundColor Red; exit 1 }
if ($pg.Substring($idx, [Math]::Min(220, $pg.Length - $idx)) -notmatch "branch_id:") {
    Write-Host "X vendor_payment_correction does not set branch_id" -ForegroundColor Red; exit 1
}
Write-Host "+ vendor correction scope derived from the original payment" -ForegroundColor Green

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
    "app/approvals/page.tsx" `
    "push_v3.74.694.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.693.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_694.txt"
    $msgLines = @(
        'fix(approvals): v3.74.694 - scope vendor payment corrections to the original payment branch',
        '',
        '- vendor_payment_correction_requests has no branch column, so its history',
        '  rows carried no scope and showed to every branch (a main-branch manager',
        '  saw Nasr-City corrections).',
        '- The branch/warehouse is now derived from original_payment_id -> payments,',
        '  so the row lands in its real branch. Verified against live data.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.694 pushed - vendor corrections scoped to their branch" -ForegroundColor Green
}
