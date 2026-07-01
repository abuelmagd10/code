$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.460.ps1") { Remove-Item -LiteralPath "push_v3.74.460.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.461"') {
    Write-Host "+ 3.74.461" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000461_v3_74_461_amendment_diff_card.sql")) {
    Write-Host "X migration 461 missing" -ForegroundColor Red; exit 1
}
Write-Host "+ migration 461 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BH\. ?Amendment Diff Card') {
    Write-Host "X CONTRACTS.md missing Section BH" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section BH" -ForegroundColor Green

$apiFile = Get-Content -LiteralPath "app/api/discount-approvals/route.ts" -Raw
if ($apiFile -notmatch 'supersedes_approval_id' -or $apiFile -notmatch 'prior_approval') {
    Write-Host "X API missing supersedes/prior_approval" -ForegroundColor Red; exit 1
}
Write-Host "+ API returns supersedes + prior_approval" -ForegroundColor Green

$pageFile = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($pageFile -notmatch 'AmendmentDiffCard' -or $pageFile -notmatch 'prior_approval') {
    Write-Host "X approvals page missing AmendmentDiffCard" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page renders AmendmentDiffCard" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_461.txt"
    $msgLines = @(
        'feat(approvals): v3.74.461 - Amendment Diff Card on the approval inbox',
        '',
        'Owner asked: "when the accountant amends a bill/invoice, what',
        'does the owner see? Just the new total?". Yes - and that was the',
        'last remaining gap before production. An accountant could swap',
        'a line item price or add a new item, and the owner would see',
        'only the new total on /approvals with no diff.',
        '',
        'DB (discount_approvals)',
        '   supersedes_approval_id uuid  - links amendment to prior',
        '   items_snapshot jsonb         - line items at approval time',
        '   shipping_snapshot / adjustment_snapshot /',
        '   tax_amount_snapshot / subtotal_snapshot numeric',
        '',
        'Triggers',
        '   bill_amendment_reset_approval_trg   - captures superseded id',
        '   bill_request_discount_approval_trg  - reads it, aggregates',
        '                                         bill_items to jsonb,',
        '                                         populates snapshots',
        '   invoice mirrors on the sales side',
        '',
        'API',
        '   /api/discount-approvals returns the new columns and joins',
        '   prior_approval when supersedes_approval_id is set.',
        '',
        'UI',
        '   /approvals renders AmendmentDiffCard on any card that has',
        '   a prior_approval. Table of subtotal/shipping/tax/adjustment/',
        '   total (before / after) plus lists of added / removed /',
        '   modified line items. Fields that did not change render',
        '   muted; changed fields highlight amber.',
        '',
        'Files',
        '   supabase/migrations/20260701000461_v3_74_461_amendment_diff_card.sql',
        '   app/api/discount-approvals/route.ts',
        '   app/approvals/page.tsx',
        '   CONTRACTS.md (Section BH added)',
        '   lib/version.ts -> 3.74.461'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.461 pushed - owner sees before/after diff on amendments" -ForegroundColor Green
}
