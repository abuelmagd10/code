$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.616.ps1") { Remove-Item -LiteralPath "push_v3.74.616.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.618"') {
    Write-Host "+ 3.74.618" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- Keep the live-functions snapshot in sync automatically on every push ---
Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "X dump-db-functions failed (check .env.local). Aborting push." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path "supabase/schema/functions.sql")) {
    Write-Host "X functions.sql not generated. Aborting." -ForegroundColor Red; exit 1
}

foreach ($f in @(
    "supabase/migrations/20260712000617_v3_74_617_recalc_and_return_guards_exclude_voided.sql",
    "supabase/migrations/20260712000618_v3_74_618_confirm_purchase_return_excludes_voided.sql"
)) {
    if (-not (Test-Path $f)) { Write-Host "X missing $f" -ForegroundColor Red; exit 1 }
}

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
    "supabase/schema/functions.sql" `
    "supabase/migrations/20260712000617_v3_74_617_recalc_and_return_guards_exclude_voided.sql" `
    "supabase/migrations/20260712000618_v3_74_618_confirm_purchase_return_excludes_voided.sql" `
    "push_v3.74.618.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.616.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_618.txt"
    $msgLines = @(
        'fix(payments): v3.74.618 - exclude voided payments from all paid-total calcs',
        '',
        'Completes the voided-payment sweep from v3.74.615/616. Four more',
        'functions summed approved payments without excluding voided ones,',
        'which could set a wrong paid_amount/status or wrongly block a return:',
        '',
        '- fn_recalc_bill_paid_status / fn_recalc_invoice_paid_status',
        '- prevent_return_creating_overpay',
        '- confirm_purchase_return_delivery_v3',
        '',
        'A repo-wide scan now finds zero payment_allocations paid-sums that',
        'omit the voided_at / voids_payment_id exclusion.',
        '',
        'The live-functions snapshot (supabase/schema/functions.sql) is now',
        'regenerated automatically by this push script, so the repo mirror',
        'stays in sync with the database on every release.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.618 pushed - voided-payment sweep complete, snapshot auto-synced" -ForegroundColor Green
}
