$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.583.ps1") { Remove-Item -LiteralPath "push_v3.74.583.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.584"') {
    Write-Host "+ 3.74.584" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260709000584_v3_74_584_overpay_guard_corrections.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ overpay-guard fix migration mirrored" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 30 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر — الرفع انتقائى حصراً
git add -- `
    "supabase/migrations/20260709000584_v3_74_584_overpay_guard_corrections.sql" `
    "lib/version.ts" `
    "push_v3.74.584.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.583.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_584.txt"
    $msgLines = @(
        'fix(purchases): v3.74.584 - overpay guard must respect executed corrections',
        '',
        'PRET-79328 goods-out was blocked by',
        'prevent_return_creating_overpay with an inflated paid figure',
        '(7.93 instead of the true 3.00): the guard recomputes paid from',
        'payment_allocations of approved payments, but a payment fully',
        'reversed via an EXECUTED vendor payment correction keeps its',
        'approved status + allocation row while the negative reversal',
        'twin carries no allocation. The corrected-away USD 0.10',
        '(~4.93 EGP) payment was therefore still counted.',
        '',
        'Fix (DB, live via MCP): both sums (approved + pending) now',
        'exclude payments that have an executed correction pointing at',
        'them. Error message also upgraded to show the approved/pending',
        'split, rounded, with clearer next-step wording.',
        '',
        'NOTE: the block itself was business-correct and still stands',
        'with true numbers (paid 3.00 + pending 3.31 > 5.43 net after',
        'the 0.88 return): the pending supplier payment must be rejected',
        'and re-issued for the post-return outstanding.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.584 pushed - overpay guard corrected" -ForegroundColor Green
}
