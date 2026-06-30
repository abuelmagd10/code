$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.425.ps1") { Remove-Item -LiteralPath "push_v3.74.425.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.426"') {
    Write-Host "+ 3.74.426" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000426_v3_74_426_supplier_payment_approval.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 426 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'Z\. ?دورة اعتماد دفع المورد') {
    Write-Host "X CONTRACTS.md missing Section Z" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section Z" -ForegroundColor Green

$approvalsPage = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($approvalsPage -notmatch '"supplier_payment"') {
    Write-Host "X approvals page missing supplier_payment branch" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page handles supplier_payment" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_426.txt"
    $msgLines = @(
        'feat(approvals): v3.74.426 - supplier payment approval workflow',
        '',
        'Closes a serious financial control gap: payments had approved_by',
        'and approved_at columns but nothing forced them, and the auto-',
        'journal trigger posted a JE on INSERT regardless of status.',
        'A staff user could record a paid supplier invoice without owner',
        'or GM review and the ledger would happily reflect it.',
        '',
        'Four DB triggers + an RPC now enforce the gate:',
        '   payment_supplier_approval_insert  (BEFORE INSERT)',
        '   payment_supplier_approval_update  (BEFORE UPDATE)',
        '   payment_supplier_notify_approval  (AFTER INS/UPD OF status)',
        '   approve_supplier_payment_atomic   (RPC)',
        '',
        'Auto-journal trigger split: was AFTER INSERT only, now',
        '   trg_auto_create_payment_journal_ins  (INSERT, guarded)',
        '   trg_auto_create_payment_journal_upd  (UPDATE OF status, guarded)',
        'so the JE is created when the payment actually reaches an',
        'approved state, not before.',
        '',
        'Privileged users (owner / GM) still self-approve on insert.',
        'Non-privileged users must start in draft or pending_approval;',
        'attempts to skip to approved raise an Arabic exception.',
        '',
        'Backfilled 13 legacy approved payments to satisfy the new',
        'contract: approved_by = created_by, approved_at = created_at.',
        '',
        'UI: /approvals page learns the new "supplier_payment" doc type',
        'and routes it to /payments/<id>.',
        '',
        'Baseline (Section Z) checks every trigger, function, RPC and',
        'guarantees the legacy single INSERT-only journal trigger is gone.',
        '',
        'Files',
        '   supabase/migrations/20260630000426_v3_74_426_supplier_payment_approval.sql',
        '   app/approvals/page.tsx',
        '   CONTRACTS.md (Section Z added)',
        '   lib/version.ts -> 3.74.426'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.426 pushed - supplier payment approval live" -ForegroundColor Green
}
