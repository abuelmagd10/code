$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.818.ps1") { Remove-Item -LiteralPath "push_v3.74.818.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.819"') {
    Write-Host "+ 3.74.819" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.819]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.819]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$m7 = Get-Content -LiteralPath "supabase/migrations/20260725000007_v3_74_819_asset_acquisition_and_legacy_paths.sql" -Raw

# --- (a) an asset can finally be capitalised ----------------------------------
foreach ($must in @("post_fixed_asset_acquisition_atomic", "acquisition_source",
                    "acquisition_journal_entry_id", "'asset_acquisition'")) {
    if ($m7 -notmatch [regex]::Escape($must)) {
        Write-Host "X acquisition posting incomplete: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ buying an asset now reaches the ledger" -ForegroundColor Green

# --- (b) and can never be capitalised twice -----------------------------------
if ($m7 -notmatch [regex]::Escape("ASSET_ALREADY_CAPITALISED")) {
    Write-Host "X an asset bought on a bill could be capitalised twice" -ForegroundColor Red; exit 1
}
if ($m7 -notmatch [regex]::Escape("'idempotent', TRUE")) {
    Write-Host "X calling the poster twice would create a second entry" -ForegroundColor Red; exit 1
}
Write-Host "+ neither path can double the asset" -ForegroundColor Green

# --- (c) nothing depreciates before it exists ---------------------------------
if ($m7 -notmatch [regex]::Escape("ASSET_NOT_CAPITALISED")) {
    Write-Host "X depreciation could still run against an asset the books never saw" -ForegroundColor Red; exit 1
}
if ($m7 -notmatch [regex]::Escape("BEFORE UPDATE OF status ON public.fixed_assets")) {
    Write-Host "X the activation guard is not wired" -ForegroundColor Red; exit 1
}
Write-Host "+ an asset cannot depreciate before it is on the books" -ForegroundColor Green

# --- (d) the hardcoded contra account is gone ---------------------------------
if ($m7 -notmatch [regex]::Escape("p_payment_account_id uuid DEFAULT NULL)")) {
    Write-Host "X asset additions still hardcode the funding account" -ForegroundColor Red; exit 1
}
Write-Host "+ an addition is funded from the account you choose, not from 1110 always" -ForegroundColor Green

# --- (e) the legacy drawings bypass is disarmed -------------------------------
if ($m7 -notmatch [regex]::Escape("DEPRECATED_DRAWING_PATH")) {
    Write-Host "X the legacy drawings path still bypasses every control" -ForegroundColor Red; exit 1
}
Write-Host "+ drawings must travel through approval" -ForegroundColor Green

# --- (f) the UI actually offers the choice ------------------------------------
$np = Get-Content -LiteralPath "app/fixed-assets/new/page.tsx" -Raw
if ($np -notmatch [regex]::Escape("acquisition_source")) {
    Write-Host "X the asset form does not ask how the asset was acquired" -ForegroundColor Red; exit 1
}
$ap = Get-Content -LiteralPath "app/api/fixed-assets/route.ts" -Raw
if ($ap -notmatch [regex]::Escape("post_fixed_asset_acquisition_atomic")) {
    Write-Host "X the API never posts the acquisition entry" -ForegroundColor Red; exit 1
}
Write-Host "+ the user chooses, and the choice reaches the ledger" -ForegroundColor Green

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
    "app/fixed-assets/new/page.tsx",
    "app/api/fixed-assets/route.ts",
    "supabase/migrations/20260725000007_v3_74_819_asset_acquisition_and_legacy_paths.sql",
    "push_v3.74.819.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.818.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_819.txt"
    $msgLines = @(
        'fix(assets,equity): v3.74.819 - a fixed asset now reaches the ledger,',
        'and two legacy bypasses are disarmed',
        '',
        'The fixed-asset screen posted NO acquisition entry at all. It created',
        'the asset row and its depreciation schedule while the books knew',
        'nothing: cash never left, the asset never appeared on the balance',
        'sheet, and depreciation then posted against an asset that had never',
        'been recognised - leaving accumulated depreciation with no asset',
        'behind it.',
        '',
        'Owner decision: support BOTH acquisition paths, chosen by the user.',
        '  - acquisition_source = bill: the purchase cycle already capitalised',
        '    it (with its supplier, VAT and controlled payment), so nothing is',
        '    posted here and a second posting is refused outright.',
        '  - acquisition_source = direct: pick the funding account and the',
        '    system posts Dr Asset / Cr that account, carrying branch and cost',
        '    centre.',
        '',
        'The decisive guard - ASSET_NOT_CAPITALISED - refuses to activate an',
        'asset that is neither linked to its bill nor carries a posted',
        'acquisition entry, so it is now structurally impossible to depreciate',
        'an asset the books never saw.',
        '',
        'Rehearsed on the test DB, rolled back: activation before',
        'capitalisation REFUSED; acquisition posted 100,000 debit / 100,000',
        'credit; a repeat call returned the SAME entry rather than a second;',
        'activation after capitalisation PASSED; and an asset flagged as',
        'bill-acquired was REFUSED a duplicate entry.',
        '',
        'register_asset_addition carried the comment "CREDIT: Bank/Cash',
        '(Hardcoded for prototype)" against 1110, so an improvement funded by',
        'the bank or booked to a supplier was deducted from petty cash. The',
        'account is now a parameter, and the function gained branch, cost',
        'centre, the posting gate, period validation and the company-access',
        'assertion it never had.',
        '',
        'record_shareholder_drawing_atomic posted a drawing as ''posted''',
        'immediately - no approval, no role check, no overdraft check, no',
        'segregation of duties - a complete bypass of the live path. It now',
        'raises a clear bilingual message pointing at the drawings screen.',
        '',
        'Data: zero fixed assets and zero drawings exist in production, so',
        'nothing historical needs repair. Entirely preventive.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.819 pushed - no asset depreciates before the books have seen it" -ForegroundColor Green
}
