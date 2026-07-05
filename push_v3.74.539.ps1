$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.539"') { Write-Host "+ 3.74.539" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ap = Get-Content -LiteralPath 'app/approvals/page.tsx' -Raw
if ($ap -notmatch 'التعديلات المقترحة') { Write-Host "X card missing proposed panel" -ForegroundColor Red; exit 1 }
if ($ap -notmatch 'proposed_amount: proposed\.amount') { Write-Host "X loader not unpacking proposed_amount" -ForegroundColor Red; exit 1 }
if ($ap -notmatch 'metadata,') { Write-Host "X loader select missing metadata" -ForegroundColor Red; exit 1 }
Write-Host "+ correction card shows proposed changes" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green }
else { Write-Host "X $tscErr TS errors" -ForegroundColor Red; $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow }
else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_539.txt"
    $msgLines = @(
        'feat(approvals): v3.74.539 - correction card shows what the accountant proposed, not just the original',
        '',
        'Owner report: correction card said "correction amount: 0.10 USD".',
        'That is the ORIGINAL payment. The proposed changes lived in',
        'metadata.proposed_changes (amount 3, currency EGP) and were',
        'invisible - owner could only approve or reject blind.',
        '',
        'Fix (UI + loader only):',
        '  Interface: proposed_amount/currency/account_name/method/date/',
        '    reference.',
        '  Loader: pulls metadata, resolves proposed account_id via',
        '    chart_of_accounts.',
        '  Card: current amount is relabelled "al-haali" and a violet',
        '    "at-tadeelat al-muqtaraha" panel lists each proposed field',
        '    with the old value crossed out and the new value bold.',
        '',
        'Files',
        '  app/approvals/page.tsx (interface + loader + card)',
        '  supabase/migrations/20260706000539_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.539'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.539 pushed - owner sees the diff" -ForegroundColor Green }
