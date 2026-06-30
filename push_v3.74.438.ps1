$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.437.ps1") { Remove-Item -LiteralPath "push_v3.74.437.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.438"') {
    Write-Host "+ 3.74.438" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000438_v3_74_438_production_order_approval.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 438 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AL\. ?دورة اعتماد أوامر الإنتاج') {
    Write-Host "X CONTRACTS.md missing Section AL" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AL" -ForegroundColor Green

$approvalsPage = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($approvalsPage -notmatch 'production_order') {
    Write-Host "X approvals page missing production_order branch" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page wired up for production_order" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_438.txt"
    $msgLines = @(
        'feat(manufacturing): v3.74.438 - production order approval workflow',
        '',
        'Same shape as v3.74.437 (routing versions), applied to',
        'manufacturing_production_orders. Closes the same end-to-end',
        'gap: APIs called approve/reject/submit RPCs that did not exist;',
        '/approvals fetch returned HTTP 400 querying approval_status.',
        '',
        'Schema',
        '   8 approval columns added with CHECK constraint',
        '   backfill: released/in_progress/completed/cancelled orders',
        '   grandfathered as approval_status=approved',
        '',
        'Helpers + guard',
        '   mpo_is_order_approval_transition_allowed',
        '   mpo_guard_production_order_approval_transition',
        '     refuses status=released without approved',
        '',
        'RPCs',
        '   submit_production_order_for_approval_atomic',
        '   approve_production_order_atomic   (owner / general_manager)',
        '   reject_production_order_atomic    (owner / general_manager)',
        '',
        'Notifications',
        '   production_order_notify_approval         owner + GM on submit',
        '   production_order_branch_manager_notify   branch manager FYI',
        '',
        'UI',
        '   /approvals unified history now includes production orders',
        '   under a Production Orders filter chip (Factory icon).',
        '',
        'Baseline (Section AL) wired via PERFORM in assert_baseline.',
        '',
        'Files',
        '   supabase/migrations/20260630000438_v3_74_438_production_order_approval.sql',
        '   app/approvals/page.tsx (history loader + filter chip)',
        '   CONTRACTS.md (Section AL added)',
        '   lib/version.ts -> 3.74.438'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.438 pushed - production order approval live" -ForegroundColor Green
}
