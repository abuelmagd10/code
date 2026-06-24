$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.318.ps1") { Remove-Item -LiteralPath "push_v3.74.318.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.319"') {
    Write-Host "+ 3.74.319" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Migration
$mig = "supabase/migrations/20260624000319_v3_74_319_services_branch_optional.sql"
if (-not (Test-Path -LiteralPath $mig)) {
    Write-Host "X migration missing: $mig" -ForegroundColor Red; exit 1
}
$mig_sql = Get-Content -LiteralPath $mig -Raw
if ($mig_sql -notmatch [regex]::Escape('ALTER COLUMN branch_id DROP NOT NULL')) {
    Write-Host "X migration must drop NOT NULL on services.branch_id" -ForegroundColor Red; exit 1
}
Write-Host "+ DB migration: services.branch_id now nullable" -ForegroundColor Green

# API route
$api = Get-Content -LiteralPath "app/api/services/route.ts" -Raw
foreach ($n in @(
    'v3.74.319 — booking_officer يرى خدمات فرعه',
    'branch_id.is.null,branch_id.eq.',
    "isCompanyScope",
    "'يجب اختيار الفرع"
)) {
    if ($api -notmatch [regex]::Escape($n)) {
        Write-Host "X services API missing: $n" -ForegroundColor Red; exit 1
    }
}
# الـ guard القديم لازم يتشال
if ($api -match "error: 'branch_id مطلوب'") {
    Write-Host "X old 'branch_id مطلوب' guard still present" -ForegroundColor Red; exit 1
}
Write-Host "+ API: accepts NULL, scoped roles still constrained" -ForegroundColor Green

# ServiceForm
$form = Get-Content -LiteralPath "components/services/ServiceForm.tsx" -Raw
foreach ($n in @(
    'v3.74.319 — Branch selector',
    'useAccess',
    'isCompanyScope',
    'ALL_BRANCHES',
    'كل الفروع (مشتركة)'
)) {
    if ($form -notmatch [regex]::Escape($n)) {
        Write-Host "X ServiceForm missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ ServiceForm: branch dropdown wired" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_319.txt"
    $msgLines = @(
        'feat(services): v3.74.319 - per-branch or shared service catalog',
        '',
        'Owner asked for the service catalog to behave the way real',
        'multi-branch businesses operate: when the owner / general',
        'manager creates a service, they pick which branch it belongs',
        'to, or leave it on "all branches" so every booking officer can',
        'reach it. A branch-bound role (manager) is auto-scoped to his',
        'own branch and cannot accidentally publish a service company',
        'wide.',
        '',
        'Three coordinated changes:',
        '',
        'DB (migration 20260624000319)',
        '  services.branch_id loses NOT NULL.',
        '  RLS (can_access_record_branch) already short-circuits to',
        '  TRUE on NULL, so the existing policy on services correctly',
        '  handles both the "scoped" and the "shared" cases without',
        '  any other DDL.',
        '',
        'API (app/api/services/route.ts)',
        '  GET: booking_officer filter switches from .eq(branch_id) to',
        '       PostgREST .or(branch_id.is.null OR branch_id.eq.own).',
        '       The role now sees their branch AND shared services.',
        '  POST: company-scope roles (owner/admin/general_manager) may',
        '        send branch_id=null; branch-scope roles (manager etc.)',
        '        get auto-scoped to member.branch_id and are forbidden',
        '        from publishing company-wide.',
        '',
        'UI (components/services/ServiceForm.tsx)',
        '  New Branch dropdown above the service-type grid.',
        '  - For owner/admin: "كل الفروع (مشتركة)" + every branch.',
        '  - For manager: locked on their own branch (Select disabled).',
        '  Uses useAccess() to read role + branch from the live profile.',
        '  Branches loaded once from /api/branches.',
        '',
        'Migration was applied directly to production before this',
        'push.',
        '',
        'Files',
        '  supabase/migrations/20260624000319_v3_74_319_services_branch_optional.sql (NEW)',
        '  app/api/services/route.ts',
        '  components/services/ServiceForm.tsx',
        '  lib/version.ts -> 3.74.319'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.319 pushed" -ForegroundColor Green
}
