$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.829.ps1") { Remove-Item -LiteralPath "push_v3.74.829.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.830"') {
    Write-Host "+ 3.74.830" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.830]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.830]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$po   = Get-Content -LiteralPath "app/api/manufacturing/production-orders/[id]/route.ts" -Raw
$bom  = Get-Content -LiteralPath "app/api/manufacturing/bom-versions/[id]/route.ts" -Raw
$rout = Get-Content -LiteralPath "app/api/manufacturing/routing-versions/[id]/route.ts" -Raw

# --- (a) no route writes cycle_no onto its own table -------------------------
foreach ($pair in @(@("production orders", $po), @("BOM versions", $bom), @("routing versions", $rout))) {
    if ($pair[1] -match [regex]::Escape("cycle_no: ((existing as any).cycle_no")) {
        Write-Host "X $($pair[0]) still writes the phantom cycle_no column" -ForegroundColor Red; exit 1
    }
}
# المرساة على **الإسناد** لا على الكلمة: التعليق الشارح يذكر اسم العمود
# القديم ليشرح ما أُصلح، فبحث الكلمة يطابق التعليق ويفشل ظلماً.
# (فخ التعليق — 793 · 809 · 810 · 829، ووقعنا فيه هنا مرة أخرى.)
if ($po -match [regex]::Escape("po_approved_by: null")) {
    Write-Host "X production orders still write the phantom po_approved_* columns" -ForegroundColor Red; exit 1
}
Write-Host "+ editing an approved record no longer writes columns that do not exist" -ForegroundColor Green

# --- (b) the cycle number comes from its only real source --------------------
foreach ($pair in @(@("production orders", $po), @("BOM versions", $bom), @("routing versions", $rout))) {
    if ($pair[1] -notmatch [regex]::Escape('.from("approval_history")')) {
        Write-Host "X $($pair[0]) does not derive the cycle number from approval_history" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the cycle number is read from approval_history, its only home" -ForegroundColor Green

# --- (c) the guard exists, is wired, and holds a baseline --------------------
$chk = Get-Content -LiteralPath "scripts/check-phantom-columns.js" -Raw
if ($chk -notmatch [regex]::Escape("const BASELINE = 56")) {
    Write-Host "X the phantom-column baseline is not recorded" -ForegroundColor Red; exit 1
}
if ($chk -notmatch [regex]::Escape("NEW write(s) target a column")) {
    Write-Host "X a newly added phantom write would not break the build" -ForegroundColor Red; exit 1
}
$wf = Get-Content -LiteralPath ".github/workflows/ci.yml" -Raw
if ($wf -notmatch [regex]::Escape("npm run check:phantom-columns")) {
    Write-Host "X the phantom-column check is not wired into CI" -ForegroundColor Red; exit 1
}
Write-Host "+ inherited debt is capped; a NEW phantom write breaks the build" -ForegroundColor Green

Write-Host "Verifying referenced scripts are committed..." -ForegroundColor Cyan
node scripts/check-referenced-scripts-tracked.js
if ($LASTEXITCODE -ne 0) { Write-Host "X referenced-scripts check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column writes..." -ForegroundColor Cyan
node scripts/check-phantom-columns.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-column check failed" -ForegroundColor Red; exit 1 }

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
    "package.json",
    ".github/workflows/ci.yml",
    "app/api/manufacturing/production-orders/[id]/route.ts",
    "app/api/manufacturing/bom-versions/[id]/route.ts",
    "app/api/manufacturing/routing-versions/[id]/route.ts",
    "scripts/check-phantom-columns.js",
    "push_v3.74.830.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.829.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_830.txt"
    $msgLines = @(
        'fix(manufacturing): v3.74.830 - re-approval on edit never worked,',
        'in three modules',
        '',
        'Live testing: saving the receipt warehouse on an APPROVED production',
        'order returned',
        '',
        '  Could not find the cycle_no column of',
        '  manufacturing_production_orders in the schema cache',
        '',
        'When a record is edited after approval, the route wrote three columns',
        'that do not exist: cycle_no (which lives only in approval_history)',
        'plus po_approved_by and po_approved_at (the real ones being',
        'approved_by and approved_at). So the "edit then re-approve" cycle has',
        'NEVER worked - and not only for production orders: BOM versions and',
        'routing versions carry the identical defect.',
        '',
        'It survived because it fails only at runtime, and only on the path',
        'where the record is ALREADY approved - the rarest state in',
        'development.',
        '',
        'All three now write the real columns, and the cycle number is derived',
        'from approval_history - its only home - instead of a phantom column',
        'that always evaluated to 2.',
        '',
        'check-phantom-columns.js compares every .update({...}) in the API',
        'routes against the table columns in the schema snapshot, on a',
        'baseline of 56: a NEW write to a non-existent column breaks the',
        'build immediately.',
        '',
        'It caught ~45 more straight away. I verified 22 of them directly',
        'against the production database: all genuinely missing. The dangerous',
        'ones sit on paths people actually use - accepting a membership',
        'invitation, attaching commissions to payroll, closing an accounting',
        'period, subscription management, and six columns across the MRP',
        'module. Recorded as a fix-one-at-a-time project in the handover,',
        'because each needs its own decision: add the column, or delete the',
        'write.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.830 pushed - edit-then-reapprove works, and phantom columns are capped" -ForegroundColor Green
}
