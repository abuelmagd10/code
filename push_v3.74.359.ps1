$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.358.ps1") { Remove-Item -LiteralPath "push_v3.74.358.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.359"') {
    Write-Host "+ 3.74.359" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- migration present ------------------------------------------------------
$mig = "supabase/migrations/20260625000359_v3_74_359_v_bookings_full_staff_name.sql"
if (Test-Path -LiteralPath $mig) {
    $migText = Get-Content -LiteralPath $mig -Raw
    foreach ($n in @(
        'CREATE OR REPLACE VIEW public.v_bookings_full',
        'COALESCE(',
        'emp.full_name'
    )) {
        if ($migText -notmatch [regex]::Escape($n)) {
            Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
        }
    }
    Write-Host "+ migration: v_bookings_full has staff_name" -ForegroundColor Green
} else { Write-Host "X missing migration file" -ForegroundColor Red; exit 1 }

# ---- BookingsTab uses Button asChild + Link wraps ---------------------------
$bt = Get-Content -LiteralPath "components/sales-orders/BookingsTab.tsx" -Raw
foreach ($n in @(
    'v3.74.359 — Button asChild',
    'asChild title={t("عرض التفاصيل"'
)) {
    if ($bt -notmatch [regex]::Escape($n)) {
        Write-Host "X BookingsTab missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ BookingsTab: Eye button uses asChild" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_359.txt"
    $msgLines = @(
        'fix(bookings): v3.74.359 - staff name in tab + view button opens',
        '',
        'Two paper cuts the owner spotted during the stage-1 test pass:',
        '',
        '1. Bookings tab in /sales-orders showed the assigned staff as a',
        '   raw 8-char UUID prefix (e.g. "24550790"). v_bookings_full',
        '   only carried staff_email; BookingsTab fell back to',
        '   staff_user_id.slice(0,8) when staff_name was missing.',
        '',
        '   Fix: add staff_name to the view, resolved as',
        '       employees.full_name',
        '    -> user_profiles.display_name',
        '    -> user_profiles.username',
        '    -> company_members.email',
        '   (the same chain v3.74.347 uses for the service-staff API).',
        '',
        '2. The Eye / "عرض التفاصيل" button in the bookings tab silently',
        '   did nothing on click. <Link><Button shadcn></Button></Link>',
        '   produces an invalid <a><button></button></a> nesting that',
        '   most browsers refuse to navigate from.',
        '',
        '   Fix: <Button asChild><Link/></Button> so the rendered DOM is',
        '   a single <a> styled as a button.',
        '',
        'Files',
        '  supabase/migrations/20260625000359_v3_74_359_v_bookings_full_staff_name.sql',
        '  components/sales-orders/BookingsTab.tsx',
        '  lib/version.ts -> 3.74.359'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.359 pushed" -ForegroundColor Green
}
