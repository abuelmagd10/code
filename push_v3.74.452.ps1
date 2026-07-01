$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.451.ps1") { Remove-Item -LiteralPath "push_v3.74.451.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.452"') {
    Write-Host "+ 3.74.452" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000452_v3_74_452_auto_archive_stale_notifs.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 452 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AY\. ?أرشفة إشعارات') {
    Write-Host "X CONTRACTS.md missing Section AY" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AY" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_452.txt"
    $msgLines = @(
        'fix(notifications): v3.74.452 - auto-archive stale approval notifications',
        '',
        'Owner saw 10 stacked approval requests for the same PO after',
        'the purchasing officer edited it several times. Every edit',
        'opened a new discount_approval and a new re-approval; old',
        'cards stayed at status=unread and cluttered the inbox.',
        '',
        'Three triggers now keep the inbox to one actionable card per',
        'document per approver:',
        '',
        '(A) discount_approval_archive_notifications',
        '    AFTER UPDATE OF status on discount_approvals.',
        '    When a discount leaves pending, archive every unread',
        '    notification with reference_type=approval_request pointing',
        '    at this discount id.',
        '',
        '(B) notification_supersede_older_approval',
        '    AFTER INSERT on notifications.',
        '    When a new approvals-category card lands for a tuple',
        '    (reference_type, reference_id, assigned_to_user), archive',
        '    every older unread card for the same tuple. Broadcasts',
        '    are handled via IS NOT DISTINCT FROM.',
        '',
        '(C) discount_approval_cascade_notifications',
        '    BEFORE DELETE on discount_approvals.',
        '    Drops any notification pointing at the discount. Closes',
        '    the orphan gap left by v3.74.451s DELETE ordering.',
        '',
        'One-shot UPDATE/DELETE archived the already-stacked notifs',
        'and removed the orphan in test company.',
        '',
        'Baseline (Section AY) wired via PERFORM in assert_baseline.',
        '',
        'Files',
        '   supabase/migrations/20260630000452_v3_74_452_auto_archive_stale_notifs.sql',
        '   CONTRACTS.md (Section AY added)',
        '   lib/version.ts -> 3.74.452'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.452 pushed - approval inbox cleaned automatically" -ForegroundColor Green
}
