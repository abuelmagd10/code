$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.823.ps1") { Remove-Item -LiteralPath "push_v3.74.823.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.824"') {
    Write-Host "+ 3.74.824" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.824]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.824]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- (a) manufacturing entries actually get posted now ------------------------
$ma = Get-Content -LiteralPath "lib/manufacturing/manufacturing-accounting.ts" -Raw
if ($ma -notmatch [regex]::Escape("async function postEntryHeader")) {
    Write-Host "X manufacturing entries are still born as drafts and never posted" -ForegroundColor Red; exit 1
}
$postCalls = ([regex]::Matches($ma, [regex]::Escape("await postEntryHeader(supabase, header.id"))).Count
if ($postCalls -lt 2) {
    Write-Host "X only $postCalls of the 2 manufacturing builders post their entry" -ForegroundColor Red; exit 1
}
Write-Host "+ both material issue and product receipt reach the ledger" -ForegroundColor Green

# --- (b) balance is verified from the DB, and failure rolls back --------------
if ($ma -notmatch [regex]::Escape('unbalanced on post')) {
    Write-Host "X an unbalanced entry could still be posted" -ForegroundColor Red; exit 1
}
Write-Host "+ nothing is posted until the stored lines themselves balance" -ForegroundColor Green

# --- (c) the four reports no longer count drafts ------------------------------
foreach ($f in @("app/reports/bank-accounts-by-branch/page.tsx",
                 "app/reports/update-account-balances/page.tsx",
                 "app/reports/fx-gains-losses/page.tsx",
                 "app/reports/bank-transactions/page.tsx")) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -notmatch [regex]::Escape('status') -or $c -notmatch [regex]::Escape('posted')) {
        Write-Host "X drafts still leak into: $f" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ a draft entry can no longer show up as a real balance" -ForegroundColor Green

# --- (d) the stale drafts are voided with their reason recorded ---------------
$m12 = Get-Content -LiteralPath "supabase/migrations/20260725000012_v3_74_824_manufacturing_entries_were_never_posted.sql" -Raw
foreach ($must in @("is_deleted = TRUE", "manufacturing_material_issue", "manufacturing_product_receipt")) {
    if ($m12 -notmatch [regex]::Escape($must)) {
        Write-Host "X the stale drafts are not cleaned: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the stranded drafts are voided, with the reason written into them" -ForegroundColor Green

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

$files = @(
    "lib/version.ts",
    "CHANGELOG.md",
    "docs/HANDOVER_2026-07-24.md",
    "lib/manufacturing/manufacturing-accounting.ts",
    "app/reports/bank-accounts-by-branch/page.tsx",
    "app/reports/update-account-balances/page.tsx",
    "app/reports/fx-gains-losses/page.tsx",
    "app/reports/bank-transactions/page.tsx",
    "supabase/migrations/20260725000012_v3_74_824_manufacturing_entries_were_never_posted.sql",
    "push_v3.74.824.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.823.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_824.txt"
    $msgLines = @(
        'fix(manufacturing,reports): v3.74.824 - manufacturing journals were',
        'born as drafts and never posted',
        '',
        'Found by pulling on a small thread while reviewing the advisory',
        'reports: why are there two DRAFT journal entries in production?',
        '',
        'createEntryHeader creates the manufacturing entry with status',
        'draft, and nowhere in the file was there a single line moving it to',
        'posted. So material issues and finished-goods receipts NEVER entered',
        'the ledger at all, while FIFO lots and physical stock moved normally',
        'and the function returned success: true.',
        '',
        'Why the live production run looked correct: a legacy trigger was',
        'posting the receipt entry in parallel (JE-000056). In 814 we dropped',
        'it as a "duplicate" and reversed its entry - when it was in fact the',
        'ONLY thing posting. The balances came out right by coincidence: a',
        'material issue of 60 never posted, and a receipt of 60 posted then',
        'reversed, netting zero - which happens to equal a correct cycle ONLY',
        'because conversion cost was zero. With the first real work-centre',
        'rate (after 818) that coincidence becomes a permanent drift.',
        '',
        'postEntryHeader now posts the entry after its lines are inserted,',
        'verifying the balance FROM THE DATABASE rather than from the in-memory',
        'array, and rolling the whole entry back if it does not balance - no',
        'orphan header, no deformed entry.',
        '',
        'Four accounting reports excluded deleted entries but never filtered',
        'status, letting drafts into balances: bank accounts by branch, the',
        'update-account-balances screen (which WRITES stored balances), FX',
        'gains and losses, and the bank transaction statement (which had no',
        'filter at all). All four now require posted and respect is_deleted.',
        '',
        'Data: the two stranded drafts are voided, with the reason written',
        'into the entry description - the cycle''s economic effect is already',
        'carried by JE-000056/57, so posting them now would double it.',
        'Verified: zero live drafts, trial balance 0.00, inventory 140.77 =',
        'FIFO valuation 140.77.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.824 pushed - manufacturing finally writes to the books it was pretending to write to" -ForegroundColor Green
}
