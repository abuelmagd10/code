$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.826.ps1") { Remove-Item -LiteralPath "push_v3.74.826.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.827"') {
    Write-Host "+ 3.74.827" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.827]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.827]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$post  = Get-Content -LiteralPath "app/api/manufacturing/work-centers/route.ts" -Raw
$patch = Get-Content -LiteralPath "app/api/manufacturing/work-centers/[id]/route.ts" -Raw
$m     = Get-Content -LiteralPath "supabase/migrations/20260726000001_v3_74_827_work_center_capacity_pair_bilingual.sql" -Raw

# --- (a) the pair is validated on BOTH routes, before the request ------------
foreach ($pair in @(@("create", $post), @("edit", $patch))) {
    if ($pair[1] -notmatch [regex]::Escape("(capUom === null) !== (capPerHour === null)")) {
        Write-Host "X the capacity pair is still unchecked on the $($pair[0]) route" -ForegroundColor Red; exit 1
    }
    if ($pair[1] -notmatch [regex]::Escape("وحدة القياس والطاقة فى الساعة")) {
        Write-Host "X no Arabic message naming the fields on the $($pair[0]) route" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ half a pair is caught with an Arabic message, before it reaches the DB" -ForegroundColor Green

# --- (b) the value the user typed is not silently dropped --------------------
foreach ($pair in @(@("create", $post), @("edit", $patch))) {
    if ($pair[1] -match [regex]::Escape("nominal_capacity_per_hour ? Number(nominal_capacity_per_hour) : null")) {
        Write-Host "X the $($pair[0]) route still normalises each half on its own" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ both halves are normalised together, as one pair" -ForegroundColor Green

# --- (c) the DB guard speaks the user's language -----------------------------
if ($m -match [regex]::Escape("must both be null or both be provided")) {
    Write-Host "X the raw English message is still in the guard" -ForegroundColor Red; exit 1
}
$bilingual = ([regex]::Matches($m, [regex]::Escape("check_violation"))).Count
if ($bilingual -lt 6) {
    Write-Host "X only $bilingual of the 6 guard messages were made bilingual" -ForegroundColor Red; exit 1
}
Write-Host "+ all six guard messages are bilingual - no raw English can surface" -ForegroundColor Green

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
    "app/api/manufacturing/work-centers/route.ts",
    "app/api/manufacturing/work-centers/[id]/route.ts",
    "supabase/migrations/20260726000001_v3_74_827_work_center_capacity_pair_bilingual.sql",
    "push_v3.74.827.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.826.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_827.txt"
    $msgLines = @(
        'fix(manufacturing): v3.74.827 - the work-centre capacity pair fails',
        'with a message the user can read',
        '',
        'Found during live testing: editing a work centre to set its labour',
        'rates threw a red toast carrying the database error verbatim -',
        '"capacity_uom and nominal_capacity_per_hour must both be null or both',
        'be provided."',
        '',
        'Capacity unit and capacity-per-hour are a pair, and the DB guard is',
        'right to reject half of one (a capacity with no unit is a number with',
        'no meaning). But both the create and edit routes normalised each half',
        'independently, so half a pair sailed through to the database and the',
        'user got a message in a language they do not read, naming columns',
        'rather than fields, with no hint of what to fix.',
        '',
        'Two layers now: the routes validate the pair BEFORE the request, with',
        'an Arabic message naming both fields and saying what to do - complete',
        'the missing one or clear both - and without silently discarding what',
        'the user typed. And the guard''s six messages are now bilingual with a',
        'check_violation code, so if any future path escapes the route check,',
        'what surfaces is still readable.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.827 pushed - errors speak Arabic and point at the field" -ForegroundColor Green
}
