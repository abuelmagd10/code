$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.326.ps1") { Remove-Item -LiteralPath "push_v3.74.326.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.327"') {
    Write-Host "+ 3.74.327" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260624000327_v3_74_327_customers_booking_officer_dml.sql"
if (-not (Test-Path -LiteralPath $mig)) {
    Write-Host "X migration missing: $mig" -ForegroundColor Red; exit 1
}
$mig_sql = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'customers_booking_officer_insert',
    'customers_booking_officer_update',
    "cm.role       = 'booking_officer'",
    'created_by_user_id = auth.uid()'
)) {
    if ($mig_sql -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration: scoped customers DML for booking_officer" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_327.txt"
    $msgLines = @(
        'fix(rls): v3.74.327 - booking_officer can create + edit own customers',
        '',
        'Reported during the first test of the new booking-officer role:',
        'creating a customer from /customers/new returned HTTP 500 in the',
        'browser, which traced down to a PostgREST 403 (error 42501).',
        '',
        'Root cause',
        '   The customers_insert / customers_update RLS policies both',
        '   gate access through can_modify_data(p_company_id). That',
        '   function hard-codes the allowed roles to',
        '     owner, admin, manager, accountant, staff',
        '   booking_officer was never added to that list, so the role',
        '   was blocked at the policy layer regardless of what its',
        '   company_role_permissions row said.',
        '',
        'Why not just update can_modify_data()',
        '   The same function gates ~20 other tables — products,',
        '   invoices, journal_entries, payments, bills, suppliers,',
        '   chart_of_accounts, etc. — places where booking_officer must',
        '   not gain write access. Adding the role to the hard-coded',
        '   list would have opened all of those at once.',
        '',
        'Fix',
        '   Two narrow PERMISSIVE policies on the customers table only:',
        '     1) customers_booking_officer_insert',
        '        any booking_officer in the company may INSERT.',
        '     2) customers_booking_officer_update',
        '        the same role may UPDATE only the rows it created',
        '        (created_by_user_id = auth.uid()).',
        '   DELETE keeps falling back to can_delete_resource() which is',
        '   already a dynamic per-permission check.',
        '',
        'Verified',
        '   The migration was applied directly to production before',
        '   this push and the failing flow on /customers/new will be',
        '   re-tested by the owner after the deploy.',
        '',
        'Files',
        '  supabase/migrations/20260624000327_v3_74_327_customers_booking_officer_dml.sql (NEW)',
        '  lib/version.ts -> 3.74.327'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.327 pushed" -ForegroundColor Green
}
