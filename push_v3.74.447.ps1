$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.446.ps1") { Remove-Item -LiteralPath "push_v3.74.446.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.447"') {
    Write-Host "+ 3.74.447" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000447_v3_74_447_sync_member_seat_number.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 447 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AT\. ?Sync member.seat_number') {
    Write-Host "X CONTRACTS.md missing Section AT" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AT" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_447.txt"
    $msgLines = @(
        'fix(billing): v3.74.447 - sync company_members.seat_number with seat_license',
        '',
        'The seat system stores the assignment twice:',
        '   company_seat_licenses.assigned_user_id  (per license)',
        '   company_members.seat_number             (per member)',
        '',
        'Any non-API assignment (admin SQL, migration, coupon, direct',
        'fix) that only updates one side leaves the other stale, and',
        'the seat management UI shows the affected member on "seat -1',
        '/ blocked". Owner hit this on شركة تست today after the',
        'manual reactivation.',
        '',
        'Fix at DB level: trigger sync_company_member_seat_number on',
        'company_seat_licenses AFTER INSERT / UPDATE OF assigned_user_id',
        '/ DELETE. Clears the old assignees seat_number if the assignee',
        'changed, stamps the new one. Handles DELETE too.',
        '',
        'One-shot reconciliation UPDATE catches any pre-existing drift.',
        '',
        'Round-trip test in DB:',
        '   1) unassign seat #1 -> member.seat_number becomes NULL ✓',
        '   2) reassign seat #1 -> member.seat_number becomes 1    ✓',
        '',
        'Baseline (Section AT) wired via PERFORM in assert_baseline.',
        '',
        'Files',
        '   supabase/migrations/20260630000447_v3_74_447_sync_member_seat_number.sql',
        '   CONTRACTS.md (Section AT added)',
        '   lib/version.ts -> 3.74.447'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.447 pushed - seat_number auto-synced" -ForegroundColor Green
}
