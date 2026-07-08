$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.578.ps1") { Remove-Item -LiteralPath "push_v3.74.578.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.579"') {
    Write-Host "+ 3.74.579" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# --- markers ---
$appr = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($appr -notmatch 'requested_by_label' -or
    $appr -notmatch 'qPretItemsMap' -or
    $appr -notmatch 'bill_returned' -or
    $appr -notmatch 'pretHistAcctMap') {
    Write-Host "X approvals enrichment markers missing" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals queue + history enrichment markers present" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 30 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر — الرفع انتقائى حصراً
git add -- `
    "app/approvals/page.tsx" `
    "lib/version.ts" `
    "push_v3.74.579.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.578.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_579.txt"
    $msgLines = @(
        'feat(approvals): v3.74.579 - richer explanatory cards + history parity',
        '',
        'Owner asked for more user-facing context on the approvals inbox',
        'cards, and the same for the decision history.',
        '',
        'Queue cards:',
        '- Purchase return: items breakdown (product x qty = value, same',
        '  pattern as the v3.74.512 history detail), settlement method',
        '  (cash refund + account name / vendor credit), requester NAME',
        '  (members-emails names-first), reason note, currency label, and',
        '  a stage-aware "what happens next" hint (admin stage: store',
        '  manager will be notified, stock does not move yet; warehouse',
        '  stage: stock deducted + supplier settled on confirmation).',
        '- Supplier payment: full bill context line (bill total, paid so',
        '  far, returns) above the outstanding line; requester name',
        '  instead of raw email; "on approval" explanation (posting,',
        '  account debit, bill/supplier balance reduction).',
        '- Customer refund: payout method line now always visible (shows',
        '  "not set yet - chosen at execution" instead of disappearing);',
        '  requester name; stage-aware hint (approve = ready, no money',
        '  moves; execute = money actually leaves, SoD reminder).',
        '',
        'History (unified log):',
        '- Customer refunds: currency on the value, invoice number,',
        '  method + account, executed-on line, requester/decider ids so',
        '  the existing batch name-resolution fills real names.',
        '- Vendor payment corrections: requester/decider ids (names were',
        '  permanently "-").',
        '- Purchase returns: settlement method + account, reason, and',
        '  goods-out status (confirmed date / still awaiting warehouse),',
        '  currency on the value label.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.579 pushed - approvals inbox clarity live" -ForegroundColor Green
}
