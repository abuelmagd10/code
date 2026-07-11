$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.606.ps1") { Remove-Item -LiteralPath "push_v3.74.606.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.607"') {
    Write-Host "+ 3.74.607" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260711000607_v3_74_607_notification_dedup_per_recipient.sql")) {
    Write-Host "X migration mirror missing" -ForegroundColor Red; exit 1
}
Write-Host "+ per-recipient notification dedup mirrored" -ForegroundColor Green

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
    "supabase/migrations/20260711000607_v3_74_607_notification_dedup_per_recipient.sql" `
    "lib/version.ts" `
    "push_v3.74.607.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.606.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_607.txt"
    $msgLines = @(
        'fix(notifications): v3.74.607 - dedup per recipient, not per event',
        '',
        'Owner test exposed it: accountant filed a sales return request;',
        'owner/admin/GM got no bell notification though the approvals',
        'card showed. DB truth: all 5 recipient notifications WERE',
        'created sharing one event_key, and the approvals dedup in',
        'create_notification archived each PREVIOUS recipient row as a',
        '"stale predecessor" before inserting the next - only the last',
        'recipient (the accountant!) kept an unread copy. Structural bug',
        'in every multi-recipient approval flow sharing an event_key.',
        '',
        'Fix (DB, live via MCP): the existence lookup, the archive',
        'UPDATE, and the unique-violation recovery now all match the',
        'SAME recipient (assigned_to_role/user, null-safe). Different',
        'recipients of one event coexist; true per-recipient duplicates',
        'still dedup exactly as designed. The four wrongly archived rows',
        'of the exposing request were revived to unread.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.607 pushed - every approver gets their bell" -ForegroundColor Green
}
