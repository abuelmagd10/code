$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.511.ps1") { Remove-Item -LiteralPath "push_v3.74.511.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.512"') {
    Write-Host "+ 3.74.512" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$api = Get-Content -LiteralPath "app/api/members-emails/route.ts" -Raw
if ($api -notmatch 'names' -or $api -notmatch 'full_name') {
    Write-Host "X members-emails missing display names" -ForegroundColor Red; exit 1
}

$ap = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($ap -notmatch 'detail_lines' -or $ap -notmatch 'purchase_return_items' -or $ap -notmatch 'nameMap') {
    Write-Host "X history detail lines / name resolution missing" -ForegroundColor Red; exit 1
}
Write-Host "+ history shows employee names + returned items detail" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_512.txt"
    $msgLines = @(
        'feat(approvals): v3.74.512 - history shows names + returned items',
        '',
        'Owner follow-ups on the enriched history:',
        '',
        '1. Show the person NAME, not the raw email. /api/members-emails',
        '   now also returns a names map: linked employee full_name',
        '   (employees.user_id within the company) first, then the auth',
        '   account metadata name; the UI falls back to the email when',
        '   neither exists.',
        '2. Detail parity with the discount entries where the data allows:',
        '   purchase-return history rows now list the returned items',
        '   (product x qty x price = line total) fetched in one batched',
        '   IN-query over purchase_return_items. Full before/after diffs',
        '   remain discount/amendment-only since only those keep',
        '   snapshots by design.',
        '',
        'Files',
        '  app/api/members-emails/route.ts',
        '  app/approvals/page.tsx',
        '  lib/version.ts -> 3.74.512'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.512 pushed - history is human-readable" -ForegroundColor Green
}
