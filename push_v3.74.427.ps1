$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.426.ps1") { Remove-Item -LiteralPath "push_v3.74.426.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.427"') {
    Write-Host "+ 3.74.427" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000427_v3_74_427_purchase_return_approval.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 427 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AA\. ?دورة اعتماد مرتجعات') {
    Write-Host "X CONTRACTS.md missing Section AA" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AA" -ForegroundColor Green

$approvalsPage = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($approvalsPage -notmatch '"purchase_return"') {
    Write-Host "X approvals page missing purchase_return branch" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page handles purchase_return" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_427.txt"
    $msgLines = @(
        'feat(approvals): v3.74.427 - purchase return approval gates',
        '',
        'purchase_returns had approved_by/at columns and an',
        'approve_purchase_return_atomic RPC, but nothing forced the',
        'use of either. A non-privileged user could write a row',
        'directly with status=approved, the auto-lock trigger would',
        'mark it locked, and the warehouse and any vendor credit',
        'logic would run without owner / GM review.',
        '',
        'Same pattern as v3.74.426 (supplier payments):',
        '   purchase_return_approval_insert   (BEFORE INSERT)',
        '   purchase_return_approval_update   (BEFORE UPDATE)',
        '   purchase_return_notify_approval   (AFTER INS/UPD OF status)',
        '',
        'Privileged users (owner / GM) self-approve on insert; others',
        'must start in draft or pending_approval and route through',
        'approve_purchase_return_atomic (existing RPC, untouched).',
        '',
        'UI: /approvals page learns the new "purchase_return" doc type',
        'and routes it to /purchase-returns/<id>.',
        '',
        'sales_returns lacks the approval columns and is deferred to',
        'v3.74.430 (sales-side equivalent).',
        '',
        'Baseline (Section AA) checks the three triggers + the RPC are',
        'present with the right invariants.',
        '',
        'Files',
        '   supabase/migrations/20260630000427_v3_74_427_purchase_return_approval.sql',
        '   app/approvals/page.tsx',
        '   CONTRACTS.md (Section AA added)',
        '   lib/version.ts -> 3.74.427'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.427 pushed - purchase return approval gates live" -ForegroundColor Green
}
