$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.603.ps1") { Remove-Item -LiteralPath "push_v3.74.603.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.604"') {
    Write-Host "+ 3.74.604" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = Get-Content -LiteralPath "supabase/migrations/20260710000603_v3_74_603_invoice_source_lookup.sql" -Raw
if ($mig -notmatch "v_booking_no text") {
    Write-Host "X corrected get_invoice_source body missing from mirror" -ForegroundColor Red; exit 1
}
Write-Host "+ get_invoice_source null-safe fix mirrored" -ForegroundColor Green

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
    "supabase/migrations/20260710000603_v3_74_603_invoice_source_lookup.sql" `
    "lib/version.ts" `
    "push_v3.74.604.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.603.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_604.txt"
    $msgLines = @(
        'fix(db): v3.74.604 - get_invoice_source null-safe (unassigned record 55000)',
        '',
        'The v3.74.603 RPC used plpgsql RECORDs; referencing fields of a',
        'never-assigned record raises 55000 - hit whenever the invoice',
        'had a booking but NO sales order (exactly the INV-2026-00001',
        'case), so the client rpc() errored, the UI treated it as "no',
        'linkage", and the Edit button kept showing for the accountant.',
        '',
        'Rewritten with null-safe scalars (DB live via MCP, verified:',
        'returns booking_no BKG-2026-00001 for the test invoice). No app',
        'code change needed - a page refresh picks up the correct gate.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.604 pushed - source lookup null-safe" -ForegroundColor Green
}
