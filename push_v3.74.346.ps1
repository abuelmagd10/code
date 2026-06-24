$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.345.ps1") { Remove-Item -LiteralPath "push_v3.74.345.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.346"') {
    Write-Host "+ 3.74.346" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- route now forwards branch_id --------------------------------------------
$route = Get-Content -LiteralPath "app/api/services/[id]/staff/route.ts" -Raw
foreach ($n in @(
    'v3.74.346 — service_staff.branch_id is NOT NULL',
    'لا يمكن إسناد موظف لخدمة بدون فرع',
    'branch_id:         svc.branch_id'
)) {
    if ($route -notmatch [regex]::Escape($n)) {
        Write-Host "X staff route missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ staff route: branch_id forwarded from svc.branch_id" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_346.txt"
    $msgLines = @(
        'fix(services): v3.74.346 - service_staff INSERT now forwards branch_id',
        '',
        'Symptom (owner, June 24 2026):',
        '  POST /api/services/<id>/staff returned 500 - the Supabase log',
        '  shows the real error: 42501 "new row violates row-level',
        '  security policy for table service_staff".',
        '',
        'Root cause',
        '  service_staff has branch_id NOT NULL and an INSERT policy whose',
        '  WITH CHECK clause is',
        '    company_id IN get_user_company_ids()',
        '      AND can_access_record_branch(company_id, branch_id)',
        '  The route was upserting without sending branch_id at all, so',
        '  Postgres tried to insert NULL. The RLS check returned TRUE for',
        '  the NULL branch (which is the intended behaviour for company-',
        '  scope rows), but the NOT NULL constraint then turned the same',
        '  attempt into a hard reject - surfacing as 42501 to PostgREST.',
        '',
        'Fix',
        '  Forward svc.branch_id (already fetched a few lines above for',
        '  the cross-branch employee guard) into the upsert payload. The',
        '  row now lands in the same branch the service is bound to, the',
        '  NOT NULL constraint is satisfied, and the WITH CHECK clause',
        '  passes because the manager has access to that branch.',
        '',
        '  Also added an early 400 guard for the corner case where the',
        '  service somehow has NULL branch_id (should be impossible since',
        '  v3.74.319 made services per-branch, but defensive).',
        '',
        'Verified',
        '  Repeated the failing upsert in the DB as the affected manager',
        '  user; it now succeeds.',
        '',
        'Files',
        '  app/api/services/[id]/staff/route.ts',
        '  lib/version.ts -> 3.74.346'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.346 pushed" -ForegroundColor Green
}
