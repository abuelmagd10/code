$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.790.ps1") { Remove-Item -LiteralPath "push_v3.74.790.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.791"') {
    Write-Host "+ 3.74.791" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.791]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.791]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the discount approval card, positively asserted ----------------------------
$page = Get-Content -LiteralPath "app/invoices/[id]/page.tsx" -Raw
foreach ($must in @(
    "const [discountApproval, setDiscountApproval]",
    "from('discount_approvals')",
    "'اعتماد الخصم'",
    "'الخصم معتمَد'",
    "decider_name"
)) {
    if ($page -notmatch [regex]::Escape($must)) {
        Write-Host "X discount approval card incomplete: $must" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ invoice details show the discount approval (status, decider, date, note)" -ForegroundColor Green

git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { Write-Host "X baseline mismatch" -ForegroundColor Red; exit 1 }

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out2 = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out2 -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
if (Test-Path ".next/types") { Remove-Item ".next/types" -Recurse -Force -ErrorAction SilentlyContinue }
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- "lib/version.ts" "CHANGELOG.md" `
    "app/invoices/[id]/page.tsx" `
    "push_v3.74.791.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.790.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_791.txt"
    $msgLines = @(
        'feat(invoices): v3.74.791 - the invoice page shows the discount approval',
        '',
        'The owner, reading INV-00003 during the live cycle test: why does the',
        'invoice detail not show the discount approval and who approved it, so',
        'the accountant knows a discounted invoice was sanctioned?',
        '',
        'The existing "Approval Status" card covers WAREHOUSE dispatch only.',
        'A new "Discount Approval" card now shows: status chip, approved',
        'amount, decided by (resolved name), decision date and note - with the',
        'source spelled out: inherited from the sales order (the v3.74.782',
        'single-decision architecture) or the invoice''s own approval for',
        'standalone invoices. Rendered only when the document went through the',
        'discount gate; hidden from print.',
        '',
        'Read path: discount_approvals SELECT RLS is company-scoped, so the',
        'accountant can SEE the decision without holding the right to make',
        'one. Names resolved via user_profiles like the dispatch card.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.791 pushed - a discounted invoice shows who sanctioned its discount" -ForegroundColor Green
}
