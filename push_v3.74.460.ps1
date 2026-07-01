$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.459.ps1") { Remove-Item -LiteralPath "push_v3.74.459.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.460"') {
    Write-Host "+ 3.74.460" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000460_v3_74_460_protect_posted_allow_pending.sql")) {
    Write-Host "X migration 460 missing" -ForegroundColor Red; exit 1
}
Write-Host "+ migration 460 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BG\. ?قبول pending_approval') {
    Write-Host "X CONTRACTS.md missing Section BG" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section BG" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_460.txt"
    $msgLines = @(
        'fix(edit-lock): v3.74.460 - allow edits on pending_approval / rejected bills and invoices',
        '',
        'Accountant edited BILL-0001 successfully once; bill moved to',
        'pending_approval (v3.74.458 opened a new discount approval).',
        'The second edit failed with:',
        '  "لا يمكن تعديل بنود فاتورة منشورة. اعمل void للفاتورة أولاً."',
        '',
        'Root cause: bill_(item_)protect_posted_trg treated any status',
        'other than draft or voided as "posted". But pending_approval is',
        'a pre-posted state where the ledger is untouched. Same on the',
        'sales side.',
        '',
        'Fix: widen the editable-status whitelist on all four triggers.',
        '   bill_protect_posted_trg',
        '   bill_item_protect_posted_trg',
        '   invoice_protect_posted_trg',
        '   invoice_item_protect_posted_trg',
        '',
        'Editable: draft, voided, pending_approval, rejected (+ cancelled',
        'for invoices).',
        'Locked: posted, paid, partially_paid, sent.',
        '',
        'Files',
        '   supabase/migrations/20260701000460_v3_74_460_protect_posted_allow_pending.sql',
        '   CONTRACTS.md (Section BG added)',
        '   lib/version.ts -> 3.74.460'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.460 pushed - pending_approval is editable" -ForegroundColor Green
}
