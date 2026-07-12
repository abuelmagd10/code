$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# Clean up any prior push scripts (614 may or may not have been committed).
if (Test-Path "push_v3.74.613.ps1") { Remove-Item -LiteralPath "push_v3.74.613.ps1" -Force }
if (Test-Path "push_v3.74.614.ps1") { Remove-Item -LiteralPath "push_v3.74.614.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.616"') {
    Write-Host "+ 3.74.616" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# The two overpayment-guard fixes must be mirrored in the repo.
foreach ($f in @(
    "supabase/migrations/20260712000615_v3_74_615_bill_overpayment_excludes_voided_payments.sql",
    "supabase/migrations/20260712000616_v3_74_616_invoice_overpayment_excludes_voided_payments.sql"
)) {
    if (-not (Test-Path $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}
Write-Host "+ overpayment-fix migration mirrors present" -ForegroundColor Green

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
    "lib/version.ts" `
    "next.config.mjs" `
    "supabase/migrations/20260712000615_v3_74_615_bill_overpayment_excludes_voided_payments.sql" `
    "supabase/migrations/20260712000616_v3_74_616_invoice_overpayment_excludes_voided_payments.sql" `
    "push_v3.74.616.ps1" 2>&1 | Out-Null
# Stage deletion of prior push scripts if they were tracked.
git add -u -- "push_v3.74.613.ps1" 2>$null
git add -u -- "push_v3.74.614.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_616.txt"
    $msgLines = @(
        'fix(payments): v3.74.616 - overpayment guards must exclude voided payments',
        '',
        'A voided payment was still counted as "paid" by both overpayment',
        'guards, inflating the paid total and wrongly blocking a legitimate',
        'remaining allocation with OVERPAYMENT_BLOCKED (seen approving a',
        'supplier payment on BILL-0001: paid read 7.928 instead of 3.00).',
        '',
        '- v3.74.615 prevent_bill_overpayment(): exclude voided_at IS NOT NULL',
        '  and voids_payment_id IS NOT NULL in both paid-sum branches.',
        '- v3.74.616 prevent_invoice_overpayment(): same fix on the customer',
        '  side.',
        'Both applied to production via MCP; these migrations mirror them.',
        '',
        'Also carries the production console-strip build option',
        '(next.config.mjs, compiler.removeConsole) if not already pushed.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.616 pushed - overpayment guards fixed" -ForegroundColor Green
}
