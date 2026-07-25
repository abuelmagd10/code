$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.828.ps1") { Remove-Item -LiteralPath "push_v3.74.828.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.829"') {
    Write-Host "+ 3.74.829" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.829]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.829]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$form    = Get-Content -LiteralPath "components/manufacturing/production-order/production-order-list-page.tsx" -Raw
$release = Get-Content -LiteralPath "app/api/manufacturing/production-orders/[id]/release/route.ts" -Raw
$m       = Get-Content -LiteralPath "supabase/migrations/20260726000002_v3_74_829_production_order_release_guards_bilingual.sql" -Raw

# --- (a) the required fields are no longer hidden -----------------------------
if ($form -notmatch [regex]::Escape("useState(true)")) {
    Write-Host "X the panel holding required fields is still collapsed by default" -ForegroundColor Red; exit 1
}
if ($form -match [regex]::Escape('"إعدادات متقدمة (المستودعات، التواريخ، الملاحظات)"')) {
    Write-Host "X the required warehouses are still labelled 'advanced settings'" -ForegroundColor Red; exit 1
}
Write-Host "+ what is required is visible and labelled required" -ForegroundColor Green

# --- (b) an incomplete order cannot be created at all -------------------------
if ($form -notmatch [regex]::Escape("missingWh")) {
    Write-Host "X the form still lets an order be created without its warehouses" -ForegroundColor Red; exit 1
}
if ($form -notmatch [regex]::Escape("setShowAdvanced(true)")) {
    Write-Host "X the form does not open the section holding the missing field" -ForegroundColor Red; exit 1
}
Write-Host "+ creation is blocked, the missing field is named, its section opens" -ForegroundColor Green

# --- (c) release says which warehouse is missing ------------------------------
foreach ($must in @("missingWarehouses", "مخزن صرف الخامات", "مخزن استلام المنتج التام")) {
    if ($release -notmatch [regex]::Escape($must)) {
        Write-Host "X the release route does not name the missing warehouse: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ release names the missing warehouse instead of an order id" -ForegroundColor Green

# --- (d) the DB guard speaks Arabic too --------------------------------------
# المرساة على النص **الجديد** لا على غياب القديم: هجرة الاستبدال **يجب** أن
# تحتوى النص الإنجليزى القديم — فهو ما تبحث عنه لتستبدله. البحث عن غيابه
# يفشل دائماً. (نفس فخ التعليق 793/809/810 فى ثوب جديد: مرساة على ما يجب
# أن يوجد، لا على ما يجب أن يغيب.)
foreach ($arabicMsg in @(
    "لا يمكن إصدار أمر إنتاج إلا وهو مسودة",
    "قبل تحديد مخزن صرف الخامات ومخزن استلام المنتج التام",
    "بلا خطوة تصنيع واحدة على الأقل")) {
    if ($m -notmatch [regex]::Escape($arabicMsg)) {
        Write-Host "X a guard message was not translated: $arabicMsg" -ForegroundColor Red; exit 1
    }
}
$bi = ([regex]::Matches($m, [regex]::Escape("check_violation"))).Count
if ($bi -lt 3) {
    Write-Host "X only $bi of the 3 release guard messages are bilingual" -ForegroundColor Red; exit 1
}
if ($m -notmatch [regex]::Escape("already patched")) {
    Write-Host "X the patch is not idempotent" -ForegroundColor Red; exit 1
}
Write-Host "+ all three release guards are bilingual, and the patch is idempotent" -ForegroundColor Green

Write-Host "Verifying referenced scripts are committed..." -ForegroundColor Cyan
node scripts/check-referenced-scripts-tracked.js
if ($LASTEXITCODE -ne 0) { Write-Host "X referenced-scripts check failed" -ForegroundColor Red; exit 1 }

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
    "components/manufacturing/production-order/production-order-list-page.tsx",
    "app/api/manufacturing/production-orders/[id]/release/route.ts",
    "supabase/migrations/20260726000002_v3_74_829_production_order_release_guards_bilingual.sql",
    "push_v3.74.829.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.828.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_829.txt"
    $msgLines = @(
        'fix(manufacturing): v3.74.829 - a required field was hidden behind',
        '"advanced settings"',
        '',
        'Live testing: pressing "release order" returned',
        '"Production order release requires issue and receipt warehouses."',
        '',
        'The guard was right; the form was wrong. The issue warehouse (where',
        'raw materials leave from) and the receipt warehouse (where the',
        'finished product lands) are prerequisites for release - without them',
        'the system does not know where anything moves. Yet both sat inside a',
        'COLLAPSED panel labelled "advanced settings", with no asterisk and no',
        'validation. The user creates the order, it looks complete (draft,',
        'approved), and only at release does a wall appear - carrying an',
        'English message that names an order id but not which warehouse is',
        'missing or where to set it. MPO-202607-000029 was missing only the',
        'receipt warehouse.',
        '',
        'Three layers: the panel is no longer "advanced" - it is "Warehouses',
        '(required)", open by default, each field carrying a red asterisk, and',
        'creation is blocked when either is empty with the missing one named',
        'and its section opened. The release route checks both before calling',
        'the database and says which one is missing and where to fix it. And',
        'the guard''s three messages - not draft, warehouses missing, no',
        'operation steps - are now bilingual with a check_violation code.',
        '',
        'The lesson: a required field does not belong behind a collapsed',
        'panel. Hiding what is mandatory lets someone finish a form believing',
        'they completed it.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.829 pushed - nothing mandatory hides behind a fold" -ForegroundColor Green
}
