$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.469.ps1") { Remove-Item -LiteralPath "push_v3.74.469.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.470"') {
    Write-Host "+ 3.74.470" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000470_v3_74_470_history_amendment_context.sql")) {
    Write-Host "X migration 470 missing" -ForegroundColor Red; exit 1
}
Write-Host "+ migration 470 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BQ\. ?سجل الاعتمادات') {
    Write-Host "X CONTRACTS.md missing Section BQ" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section BQ" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'is_amendment' -or $page -notmatch 'amendment_delta') {
    Write-Host "X approvals page missing amendment badge/delta" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page shows amendment badge + delta" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_470.txt"
    $msgLines = @(
        'feat(history): v3.74.470 - approvals history shows amendment context (badge + delta)',
        '',
        'Owner approved the BILL-0001 amendment. Opened the history tab',
        'and saw only "الخصم: 10%" with no hint that this was a re-approval',
        'or that the bill total moved. Context lost.',
        '',
        'UI-only fix (no DB changes). UnifiedHistoryEntry now carries:',
        '   is_amendment    - supersedes_approval_id was set',
        '   amendment_delta - "before -> after (delta)" over document_total',
        '   prior_status    - rejected / approved / null',
        '',
        'UnifiedHistoryCard renders:',
        '   Amber badge "🔄 تعديل" (with " · بعد رفض" when the prior',
        '   status was rejected)',
        '   Line: "💰 الإجمالى: 8.53 → 8.73 (+0.20)"',
        '',
        'Applies to purchases and sales alike.',
        '',
        'Files',
        '   supabase/migrations/20260701000470_v3_74_470_history_amendment_context.sql',
        '   app/approvals/page.tsx',
        '   CONTRACTS.md (Section BQ added)',
        '   lib/version.ts -> 3.74.470'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.470 pushed - history reflects amendment context" -ForegroundColor Green
}
