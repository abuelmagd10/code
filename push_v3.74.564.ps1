$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.564"') { Write-Host "+ 3.74.564" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_564.txt"
    $msgLines = @(
        'feat(je): v3.74.564 - reversal RPC + depreciation IAS 21 fix',
        '',
        'Journal Entries audit found two live gaps.',
        '',
        'A) Posted JE cannot be corrected because delete is blocked and',
        '   no reversal RPC existed. Added reverse_journal_entry() that',
        '   creates a swapped-D/C mirror JE, preserves IAS 21 columns,',
        '   enforces SoD (creator ne reverser unless owner/GM), and',
        '   respects financial-period lock on the reversal date.',
        '',
        'B) post_depreciation() was writing base amounts only, leaving',
        '   IAS 21 columns NULL. Fixed to stamp original_* + rate + base',
        '   ccy from company. Added period lock and explicit posted.',
        '',
        'Files',
        '  supabase/migrations/20260706000564_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.564'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.564 pushed" -ForegroundColor Green }
