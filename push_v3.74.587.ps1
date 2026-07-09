$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.586.ps1") { Remove-Item -LiteralPath "push_v3.74.586.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.587"') {
    Write-Host "+ 3.74.587" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260709000587_v3_74_587_refund_orphan_cleanup_and_guard.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ refund-orphan cleanup + guards migration mirrored" -ForegroundColor Green

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
    "supabase/migrations/20260709000587_v3_74_587_refund_orphan_cleanup_and_guard.sql" `
    "lib/version.ts" `
    "push_v3.74.587.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.586.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_587.txt"
    $msgLines = @(
        'fix(refunds): v3.74.587 - orphan refund cleanup + delete guards',
        '',
        'Owner spotted an approved 500 EGP customer refund request still',
        'ready-to-execute. Verified orphan: it referenced the hard-deleted',
        'test invoice INV-2026-00001 AND a deleted payment - executing it',
        'would have paid real money against nothing. Same root cause as',
        'the v3.74.585 bonus orphan (the booking-chain cleanup missed the',
        'request tables). Hard-deleted (no accounting footprint).',
        '',
        'Prevention (DB, live via MCP):',
        '- invoice delete -> auto-cancel its UNEXECUTED customer refund',
        '  requests (with Arabic audit reason)',
        '- payment delete -> auto-cancel UNEXECUTED refund + vendor',
        '  payment correction requests referencing it',
        '- executed requests are deliberately untouched (real accounting',
        '  must go through proper correction flows)',
        '',
        'Post-cleanup sweep: ZERO remaining references to the deleted',
        'invoice/booking across 8 request/approval/accounting tables.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.587 pushed - refund integrity guards live" -ForegroundColor Green
}
