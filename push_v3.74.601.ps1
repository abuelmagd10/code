$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.600.ps1") { Remove-Item -LiteralPath "push_v3.74.600.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.601"') {
    Write-Host "+ 3.74.601" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260710000601_v3_74_601_fix_invoice_amendment_trigger_and_resync.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ amendment-trigger fix + resync shield mirrored" -ForegroundColor Green

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
    "supabase/migrations/20260710000601_v3_74_601_fix_invoice_amendment_trigger_and_resync.sql" `
    "lib/version.ts" `
    "push_v3.74.601.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.600.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_601.txt"
    $msgLines = @(
        'fix(invoices): v3.74.601 - amendment trigger crash + resync governance shield',
        '',
        'The booking addons post-execution edit failed with 42703:',
        'invoice_amendment_reset_approval_trg computed the amendment',
        'requester from last_edited_by_user_id / created_by - columns',
        'that exist on BILLS but not on invoices (the function was',
        'copied from the bills counterpart). Latent crash for ANY',
        'material draft-invoice change outside a skip-config path.',
        'Fixed to created_by_user_id (the only creator column invoices',
        'has).',
        '',
        'resync_booking_invoice now sets app.skip_discount_approval =',
        'booking_resync before touching the invoice: booking-side edits',
        'carry their own governance (role gates + notifications +',
        'booking discount approvals), so no parallel sales-invoice',
        'amendment approval is opened for the same change. Resync',
        'notifications also gained kinds (accountant=action, FYI=info)',
        'per the v3.74.588 lifecycle.',
        '',
        'DB already live via MCP; docs-only commit.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.601 pushed - booking edits sync cleanly" -ForegroundColor Green
}
