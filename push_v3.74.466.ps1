$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.465.ps1") { Remove-Item -LiteralPath "push_v3.74.465.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.466"') {
    Write-Host "+ 3.74.466" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000466_v3_74_466_rejected_in_baseline.sql")) {
    Write-Host "X migration 466 missing" -ForegroundColor Red; exit 1
}
Write-Host "+ migration 466 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BM\. ?baseline يشمل rejected') {
    Write-Host "X CONTRACTS.md missing Section BM" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section BM" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'priorWasRejected') {
    Write-Host "X approvals page missing rejection panel" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page renders rejection panel" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_466.txt"
    $msgLines = @(
        'feat(diff-card): v3.74.466 - amendment after rejection shows the previous rejection context',
        '',
        'Owner asked: if I reject an amendment and the accountant edits',
        'again before I take any other action, what does the owner see?',
        'Before: the new amendment linked back to the PO baseline (not',
        'the rejection), so the DiffCard lost the context that the',
        'previous attempt was rejected.',
        '',
        'Amendment triggers now include status=rejected in the baseline',
        'lookup: bill_amendment_reset_approval_trg +',
        'invoice_amendment_reset_approval_trg. The new amendments',
        'supersedes_approval_id points at the last rejected row when it',
        'is the most recent action.',
        '',
        'AmendmentDiffCard renders a red "A previous amendment was',
        'rejected" panel when prior_approval.status=rejected, showing',
        'the rejection reason (decision_note) and the rejected total.',
        'Owner immediately sees "you rejected X for reason Y - the',
        'accountant now proposes Z".',
        '',
        'Files',
        '   supabase/migrations/20260701000466_v3_74_466_rejected_in_baseline.sql',
        '   app/approvals/page.tsx',
        '   CONTRACTS.md (Section BM added)',
        '   lib/version.ts -> 3.74.466'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.466 pushed - rejection context preserved" -ForegroundColor Green
}
