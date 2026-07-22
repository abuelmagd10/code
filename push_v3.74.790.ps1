$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.789.ps1") { Remove-Item -LiteralPath "push_v3.74.789.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.790"') {
    Write-Host "+ 3.74.790" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.790]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.790]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the three DB patches of this release, positively asserted ------------------
$m1 = Get-Content -LiteralPath "supabase/migrations/20260722000006_v3_74_790_branch_manager_discount_fyi.sql" -Raw
foreach ($must in @("notify_branch_manager", "نشاط فرعك", "v_branch_id")) {
    if ($m1 -notmatch [regex]::Escape($must)) {
        Write-Host "X branch-manager FYI migration incomplete: $must" -ForegroundColor Red; exit 1
    }
}
$m2 = Get-Content -LiteralPath "supabase/migrations/20260722000007_v3_74_790_zero_discount_unblocks_invoice.sql" -Raw
foreach ($must in @("zero-discount unblock", "create_auto_invoice_from_sales_order(p_so_id)", "anchor matched % times")) {
    if ($m2 -notmatch [regex]::Escape($must)) {
        Write-Host "X zero-discount unblock migration incomplete: $must" -ForegroundColor Red; exit 1
    }
}
$m3 = Get-Content -LiteralPath "supabase/migrations/20260722000008_v3_74_790_rejected_guard_respects_zero_discount.sql" -Raw
foreach ($must in @("v_total_disc > 0", "inv_evaluate_discount_approval", "bill_evaluate_discount_approval")) {
    if ($m3 -notmatch [regex]::Escape($must)) {
        Write-Host "X rejected-guard migration incomplete: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ all three DB patches recorded (already applied to test + prod)" -ForegroundColor Green

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
    "supabase/migrations/20260722000006_v3_74_790_branch_manager_discount_fyi.sql" `
    "supabase/migrations/20260722000007_v3_74_790_zero_discount_unblocks_invoice.sql" `
    "supabase/migrations/20260722000008_v3_74_790_rejected_guard_respects_zero_discount.sql" `
    "push_v3.74.790.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.789.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_790.txt"
    $msgLines = @(
        'feat(governance): v3.74.790 - branch manager FYI on discount decisions + the zero-discount dead end is sealed',
        '',
        'Owner rule while reviewing the SO-0003 rejection notification map:',
        'the branch manager must know what happens in his branch. Discount',
        'decisions (approved/rejected) on any document now also send an FYI',
        'to the document branch''s manager through his established channel,',
        'with the decision reason. Branch derived per document type since',
        'discount_approvals carries no branch_id; the FYI can never fail the',
        'decision itself.',
        '',
        'Same release seals a verified dead end in the rejection hint («احذف',
        'الخصم أو غيّره»): removing the discount entirely left the order',
        'invoiceless forever, from two stacked defects:',
        '1. so_evaluate''s zero branch cancels the pending approval and',
        '   returns - nothing ever creates the invoice.',
        '2. Even attempting creation failed: the rejected-discount guard',
        '   blocked the invoice WITHOUT checking that its current aggregate',
        '   discount is zero - vetoing an invoice that no longer carries the',
        '   rejected discount. Its purchases twin (bills after PO rejection)',
        '   had the same blindness; both fixed.',
        '',
        'After both patches, rehearsed end-to-end on the restored test copy:',
        'discount 5 -> owner rejects -> employee zeroes -> the invoice is',
        'born automatically with its items, zero discount, notifications.',
        'Mixed discounts (line + document): zeroing one while keeping the',
        'other keeps the aggregate positive -> a fresh approval cycle opens -',
        'no dead end on that path by design.',
        '',
        'DB-only release; all three patches applied to test + prod via',
        'anchor-verified substitution. These migrations are the repo record.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.790 pushed - the branch manager knows; the zero-discount path flows" -ForegroundColor Green
}
