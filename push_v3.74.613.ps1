$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.611.ps1") { Remove-Item -LiteralPath "push_v3.74.611.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.613"') {
    Write-Host "+ 3.74.613" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- The live-functions snapshot must be generated BEFORE pushing ---
if (-not (Test-Path "supabase/schema/functions.sql")) {
    Write-Host "X supabase/schema/functions.sql is missing." -ForegroundColor Red
    Write-Host "  Run the dump first:  node scripts/dump-db-functions.js" -ForegroundColor Yellow
    exit 1
}
$fnBytes = (Get-Item "supabase/schema/functions.sql").Length
if ($fnBytes -lt 100000) {
    Write-Host "X functions.sql looks too small ($fnBytes bytes) - re-run the dump." -ForegroundColor Red
    exit 1
}
Write-Host "+ functions snapshot present ($fnBytes bytes)" -ForegroundColor Green

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
    "scripts/dump-db-functions.js" `
    "supabase/schema/functions.sql" `
    "supabase/migrations/20260712000612_v3_74_612_fix_invoice_effective_outstanding_column.sql" `
    "supabase/migrations/20260712000613_v3_74_613_export_public_routines_util.sql" `
    "push_v3.74.613.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.611.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_613.txt"
    $msgLines = @(
        'chore(db): v3.74.613 - mirror all live DB functions into repo + fix payment outstanding',
        '',
        'Prevents the "RPC lives only in production" class of surprise that',
        'caused the v3.74.612 outage (get_invoice_effective_outstanding read a',
        'non-existent column and broke customer payments).',
        '',
        '- supabase/schema/functions.sql: auto-generated snapshot of all 1165',
        '  live public functions/procedures (repo is now the SSOT).',
        '- scripts/dump-db-functions.js: regenerates that snapshot on demand',
        '  (node scripts/dump-db-functions.js) via a service-role-only RPC.',
        '- migration v3.74.613: export_public_routines() introspection util.',
        '- migration v3.74.612: mirror of the get_invoice_effective_outstanding',
        '  fix (srr.total_amount -> srr.total_return_amount) already applied to',
        '  production.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.613 pushed - live DB functions mirrored to repo" -ForegroundColor Green
}
