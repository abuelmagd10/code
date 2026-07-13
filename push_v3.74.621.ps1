$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.620.ps1") { Remove-Item -LiteralPath "push_v3.74.620.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.621"') {
    Write-Host "+ 3.74.621" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$pg = Get-Content -LiteralPath "app/payments/page.tsx" -Raw
if ($pg -notmatch 'v3\.74\.621' -or $pg -notmatch 'branchInvCustomerIds') {
    Write-Host "X branch-invoice customer exception missing from payments page" -ForegroundColor Red; exit 1
}
Write-Host "+ payment-page cross-branch customer exception present" -ForegroundColor Green

# keep the live-functions snapshot in sync (no DB change expected this release)
Write-Host "Regenerating live DB functions snapshot..." -ForegroundColor Cyan
& node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "X dump-db-functions failed (check .env.local). Aborting push." -ForegroundColor Red
    exit 1
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
    "app/payments/page.tsx" `
    "supabase/schema/functions.sql" `
    "push_v3.74.621.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.620.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_621.txt"
    $msgLines = @(
        'feat(payments): v3.74.621 - branch accountant can collect any invoice in their branch',
        '',
        'A branch-scoped accountant only saw customers whose home branch',
        'matched theirs, so a customer belonging to another branch but with',
        'an invoice in THIS branch was missing from the payment customer',
        'picker (their invoice could not be collected).',
        '',
        'The customer payments page now also merges in customers who have at',
        'least one invoice in the current branch, in addition to same-branch',
        'and null-branch customers. Visibility follows the invoice/branch.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.621 pushed - cross-branch invoice collection enabled" -ForegroundColor Green
}
