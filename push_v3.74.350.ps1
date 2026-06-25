$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.349.ps1") { Remove-Item -LiteralPath "push_v3.74.349.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.350"') {
    Write-Host "+ 3.74.350" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- migration file present --------------------------------------------------
$mig = "supabase/migrations/20260624000350_v3_74_350_service_staff_booking_officer_select.sql"
if (Test-Path $mig) {
    $migText = Get-Content -LiteralPath $mig -Raw
    foreach ($n in @(
        'CREATE POLICY service_staff_booking_officer_select ON public.service_staff',
        "cm.role       = 'booking_officer'",
        'cm.branch_id IS NULL',
        'service_staff.branch_id = cm.branch_id'
    )) {
        if ($migText -notmatch [regex]::Escape($n)) {
            Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
        }
    }
    Write-Host "+ migration: booking_officer SELECT policy on service_staff" -ForegroundColor Green
} else { Write-Host "X missing migration file" -ForegroundColor Red; exit 1 }

# ---- type-check --------------------------------------------------------------
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

# ---- commit + push -----------------------------------------------------------
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_350.txt"
    $msgLines = @(
        'fix(rls): v3.74.350 - booking officer can read service_staff links',
        '',
        'Symptom (owner, June 24 2026):',
        '  A floating booking_officer (no branch assigned) created a new',
        '  booking, picked the branch and the service, then opened the',
        '  staff dropdown - and the dropdown showed EVERY employee in',
        '  the branch even though the chosen service is bound to a',
        '  smaller list.',
        '',
        'Root cause',
        '  service_staff_select requires',
        '      can_access_record_branch(company_id, branch_id) = TRUE',
        '  For non-owner / non-admin roles that function reduces to a',
        '  branch equality check. The floating officer has user.branch',
        '  NULL, so the comparison yields NULL -> false and the policy',
        '  returns zero rows. /api/services/[id]/staff then returns an',
        '  empty list, and BookingForm interprets "empty list" as',
        '  "service has no assigned staff" and falls through to the',
        '  every-branch-employee list - the exact wrong behaviour.',
        '',
        'Fix',
        '  Added a PERMISSIVE SELECT policy',
        '  service_staff_booking_officer_select that mirrors v3.74.349',
        '  for services:',
        '    * booking_officer with branch X -> sees rows in branch X',
        '      plus NULL-branch legacy rows',
        '    * booking_officer with no branch -> sees every row in the',
        '      company',
        '  service_staff_select stays untouched. Every other role keeps',
        '  its current behaviour exactly.',
        '',
        'Files',
        '  supabase/migrations/20260624000350_v3_74_350_service_staff_booking_officer_select.sql',
        '  lib/version.ts -> 3.74.350'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.350 pushed" -ForegroundColor Green
}
