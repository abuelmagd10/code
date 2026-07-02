$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.493.ps1") { Remove-Item -LiteralPath "push_v3.74.493.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.494"') {
    Write-Host "+ 3.74.494" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000494_v3_74_494_amendment_notice_wording.sql")) {
    Write-Host "X migration 494 missing" -ForegroundColor Red; exit 1
}
Write-Host "+ migration 494 present" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_494.txt"
    $msgLines = @(
        'fix(notif): v3.74.494 - amendment decision notice no longer says "discount"',
        '',
        'Since v3.74.463 the discount_approvals table is the hub for',
        'every material amendment on a bill/invoice (quantity, shipping,',
        'tax, discount). notify_discount_decision_trg still hard-coded',
        'the noun as "الخصم" so a quantity amendment approval landed as:',
        '  Title: تم اعتماد الخصم',
        '  Body : تم اعتماد طلب الخصم على فاتورة المشتريات BILL-0001',
        'even though the accountant changed a line quantity.',
        '',
        'The trigger now switches wording by supersedes_approval_id:',
        '  NULL      -> fresh discount request, keep "الخصم"',
        '  NOT NULL  -> amendment cycle, use "التعديل" + hint that asks',
        '               the accountant to edit the bill to reopen',
        '               approval.',
        '',
        'Body installed via Supabase MCP.',
        '',
        'Files',
        '  supabase/migrations/20260701000494_v3_74_494_amendment_notice_wording.sql',
        '  CONTRACTS.md (Section CO added)',
        '  lib/version.ts -> 3.74.494'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.494 pushed - amendment notice reads correctly" -ForegroundColor Green
}
