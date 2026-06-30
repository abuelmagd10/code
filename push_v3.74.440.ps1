$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.439.ps1") { Remove-Item -LiteralPath "push_v3.74.439.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.440"') {
    Write-Host "+ 3.74.440" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000440_v3_74_440_product_receive_notifications.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 440 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AN\. ?استكمال manufacturing_product_receive') {
    Write-Host "X CONTRACTS.md missing Section AN" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AN" -ForegroundColor Green

$approvalsPage = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($approvalsPage -notmatch 'product_receive') {
    Write-Host "X approvals page missing product_receive branch" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page wired up for product_receive" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_440.txt"
    $msgLines = @(
        'feat(manufacturing): v3.74.440 - product receive notifications + history',
        '',
        'manufacturing_product_receive_approvals had the full schema and',
        'working API routes (request / approve / reject) but no DB',
        'triggers, so:',
        '   - owner / GM only learned of new requests by polling',
        '   - branch manager had zero visibility',
        '   - decisions were absent from the unified history feed',
        '',
        'Two triggers fix that:',
        '   product_receive_notify_approval        owner + GM on pending',
        '   product_receive_branch_manager_notify  branch manager FYI on',
        '                                          create + approve/reject',
        '',
        'UI: /approvals unified history now reads product receive',
        'approvals with status in (approved, rejected) and renders them',
        'under a Product Receive filter chip (CheckCircle2 icon).',
        '',
        'Baseline (Section AN) wired via PERFORM in assert_baseline.',
        '',
        'Files',
        '   supabase/migrations/20260630000440_v3_74_440_product_receive_notifications.sql',
        '   app/approvals/page.tsx (history loader + filter chip)',
        '   CONTRACTS.md (Section AN added)',
        '   lib/version.ts -> 3.74.440'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.440 pushed - product receive coverage complete" -ForegroundColor Green
}
