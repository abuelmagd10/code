$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.436.ps1") { Remove-Item -LiteralPath "push_v3.74.436.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.437"') {
    Write-Host "+ 3.74.437" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000437_v3_74_437_routing_version_approval.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 437 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AK\. ?دورة اعتماد مسارات التصنيع') {
    Write-Host "X CONTRACTS.md missing Section AK" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AK" -ForegroundColor Green

$approvalsPage = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($approvalsPage -notmatch 'routing_version') {
    Write-Host "X approvals page missing routing_version branch" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page wired up for routing_version" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_437.txt"
    $msgLines = @(
        'feat(manufacturing): v3.74.437 - routing version approval workflow',
        '',
        'The codebase had API routes and UI for routing version approvals,',
        'but the DB tables had no approval columns and the RPCs they call',
        'did not exist. Approve / reject / submit calls failed with',
        '"function does not exist"; /approvals fetch returned HTTP 400.',
        '',
        'This release closes the gap end to end:',
        '',
        'Schema',
        '   ALTER manufacturing_routing_versions ADD',
        '     approval_status (CHECK draft/pending_approval/approved/rejected),',
        '     submitted_by/at, approved_by/at, rejected_by/at, rejection_reason',
        '   Backfill: existing status=active rows grandfathered to approved.',
        '',
        'Helpers + guard',
        '   mr_is_routing_version_approval_transition_allowed',
        '   mr_guard_routing_version_approval_transition trigger',
        '     refuses bad transitions AND status=active without approved',
        '',
        'RPCs (signatures match existing API routes)',
        '   submit_routing_version_for_approval_atomic',
        '   approve_routing_version_atomic   (owner / general_manager)',
        '   reject_routing_version_atomic    (owner / general_manager)',
        '',
        'Notifications',
        '   routing_version_notify_approval         owner + GM on submit',
        '   routing_version_branch_manager_notify   branch manager FYI',
        '',
        'UI',
        '   /approvals unified history (v3.74.435) now includes routing',
        '   versions under a Routings filter chip with GitMerge icon.',
        '',
        'Baseline (Section AK) wired via PERFORM in assert_baseline.',
        '',
        'Files',
        '   supabase/migrations/20260630000437_v3_74_437_routing_version_approval.sql',
        '   app/approvals/page.tsx (history loader + filter chip)',
        '   CONTRACTS.md (Section AK added)',
        '   lib/version.ts -> 3.74.437'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.437 pushed - routing version approval live" -ForegroundColor Green
}
