$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.510.ps1") { Remove-Item -LiteralPath "push_v3.74.510.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.511"') {
    Write-Host "+ 3.74.511" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ap = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($ap -notmatch 'requested_by_id' -or $ap -notmatch 'members-emails' -or $ap -notmatch 'received_by') {
    Write-Host "X history actor enrichment missing" -ForegroundColor Red; exit 1
}
Write-Host "+ history rows carry requester/decider emails + doc context" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_511.txt"
    $msgLines = @(
        'feat(approvals): v3.74.511 - history rows show who requested/decided',
        '',
        'Owner compared the rich discount history entries (requester +',
        'decider emails, full amendment diff) with the other categories',
        'that showed dashes. Discounts go through their API which',
        'enriches emails server-side; the direct-table loaders never',
        'carried actor ids.',
        '',
        '- History entries now carry requested_by_id / decided_by_id from',
        '  the source tables (purchase returns: created_by +',
        '  approved_by/rejected_by; goods receipt: bill creator +',
        '  received_by/rejected_by; dispatch: poster + approved_by;',
        '  supplier payments + write-offs likewise).',
        '- One batched POST to the existing /api/members-emails endpoint',
        '  resolves all ids -> emails after the merge (best-effort).',
        '- Purchase-return rows now include the source bill number in the',
        '  label (PRET-5689 - BILL-0001).',
        '',
        'Files',
        '  app/approvals/page.tsx',
        '  lib/version.ts -> 3.74.511'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.511 pushed - history tells who did what" -ForegroundColor Green
}
