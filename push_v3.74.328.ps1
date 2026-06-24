$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.327.ps1") { Remove-Item -LiteralPath "push_v3.74.327.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.328"') {
    Write-Host "+ 3.74.328" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260624000328_v3_74_328_customers_booking_officer_select_branch.sql"
if (-not (Test-Path -LiteralPath $mig)) {
    Write-Host "X migration missing: $mig" -ForegroundColor Red; exit 1
}
$mig_sql = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'customers_booking_officer_select_branch',
    "cm.role       = 'booking_officer'",
    'customers.branch_id = cm.branch_id',
    'cm.branch_id IS NULL'
)) {
    if ($mig_sql -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration: branch-wide customer visibility for booking_officer" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_328.txt"
    $msgLines = @(
        'feat(rls): v3.74.328 - booking_officer sees branch customers',
        '',
        'v3.74.327 let the booking officer create + edit customers, but',
        'reading was still scoped to own (created_by_user_id =',
        'auth.uid()) under customers_select_v5. That fits a private-',
        'data staff role, not a front-desk booking officer who needs to',
        'look up returning customers — including ones a colleague',
        'created last week.',
        '',
        'New permissive SELECT policy on customers only:',
        '   * booking_officer tied to branch X',
        '     -> every customer in branch X',
        '     -> plus customers with branch_id IS NULL (company-level)',
        '   * booking_officer with no branch_id assigned',
        '     -> every customer in the company (matches the floating-',
        '        officer pattern v3.74.324 already enabled on bookings)',
        '',
        'The existing customers_select_v5 stays in place untouched so',
        'every other role keeps the exact behaviour it has today.',
        '',
        'Migration was applied directly to production before this push.',
        '',
        'Files',
        '  supabase/migrations/20260624000328_v3_74_328_customers_booking_officer_select_branch.sql (NEW)',
        '  lib/version.ts -> 3.74.328'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.328 pushed" -ForegroundColor Green
}
