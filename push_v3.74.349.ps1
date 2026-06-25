$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.348.ps1") { Remove-Item -LiteralPath "push_v3.74.348.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.349"') {
    Write-Host "+ 3.74.349" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- migration file present --------------------------------------------------
$mig = "supabase/migrations/20260624000349_v3_74_349_services_booking_officer_select.sql"
if (Test-Path $mig) {
    $migText = Get-Content -LiteralPath $mig -Raw
    foreach ($n in @(
        'CREATE POLICY services_booking_officer_select ON public.services',
        "cm.role       = 'booking_officer'",
        'cm.branch_id IS NULL',
        'services.branch_id = cm.branch_id'
    )) {
        if ($migText -notmatch [regex]::Escape($n)) {
            Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
        }
    }
    Write-Host "+ migration: booking_officer SELECT policy on services" -ForegroundColor Green
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_349.txt"
    $msgLines = @(
        'fix(rls): v3.74.349 - booking officer with no branch sees all services',
        '',
        'Symptom (owner, June 24 2026):',
        '  A booking_officer set to "no branch" (floating) opened the',
        '  /services page and saw an empty list. Owner expects them to',
        '  see every booking service in the company so they can create',
        '  bookings against any of them.',
        '',
        'Root cause',
        '  services.services_select requires can_access_record_branch',
        '  (company_id, branch_id) = TRUE. For non-admin / non-owner',
        '  users that function reduces to',
        '      v_user_branch_id = p_branch_id',
        '  With v_user_branch_id NULL (floating officer) and',
        '  p_branch_id non-NULL (services have been per-branch since',
        '  v3.74.319), the comparison yields NULL -> false -> the row',
        '  is filtered out. Result: the entire services list disappears',
        '  for the floating officer.',
        '',
        'Fix',
        '  Added a PERMISSIVE SELECT policy services_booking_officer_select',
        '  that mirrors v3.74.328 for customers and v3.74.324 for',
        '  bookings:',
        '    * booking_officer with branch X -> sees branch X services',
        '      + NULL-branch legacy rows',
        '    * booking_officer with no branch -> sees every service in',
        '      the company',
        '  The existing services_select policy is untouched, so every',
        '  other role keeps its current behaviour bit-for-bit.',
        '',
        'Files',
        '  supabase/migrations/20260624000349_v3_74_349_services_booking_officer_select.sql',
        '  lib/version.ts -> 3.74.349'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.349 pushed" -ForegroundColor Green
}
