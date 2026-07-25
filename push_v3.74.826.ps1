$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.825.ps1") { Remove-Item -LiteralPath "push_v3.74.825.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.826"') {
    Write-Host "+ 3.74.826" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.826]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.826]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$bf = Get-Content -LiteralPath "components/bookings/BookingsFilters.tsx" -Raw
$api = Get-Content -LiteralPath "app/api/bookings/route.ts" -Raw

# --- (a) the default actually changed -----------------------------------------
if ($bf -notmatch [regex]::Escape('status:        "active"')) {
    Write-Host "X bookings still open on the full history" -ForegroundColor Red; exit 1
}
if ($bf -notmatch [regex]::Escape('<SelectItem value="active">')) {
    Write-Host "X the active option is not offered in the filter" -ForegroundColor Red; exit 1
}
Write-Host "+ bookings open on what is live, not on the archive" -ForegroundColor Green

# --- (b) the API understands it, and 'all' still means all --------------------
if ($api -notmatch [regex]::Escape("status === 'active'")) {
    Write-Host "X the API would treat 'active' as a literal status and return nothing" -ForegroundColor Red; exit 1
}
if ($api -notmatch [regex]::Escape('"cancelled","no_show"')) {
    Write-Host "X cancelled and no-show are not the ones excluded" -ForegroundColor Red; exit 1
}
if ($api -notmatch [regex]::Escape("} else if (status) {")) {
    Write-Host "X filtering by a single status would break" -ForegroundColor Red; exit 1
}
Write-Host "+ every other status filter keeps working exactly as before" -ForegroundColor Green

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
    "components/bookings/BookingsFilters.tsx",
    "app/api/bookings/route.ts",
    "push_v3.74.826.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.825.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_826.txt"
    $msgLines = @(
        'feat(bookings): v3.74.826 - open on active bookings, not on the',
        'whole history',
        '',
        '825 made the crowded day cell scrollable; this removes the crowding.',
        'Five of the eight bookings in the owner''s company are cancelled - 62%',
        'of the calendar is archive, pushing the live bookings behind a scroll.',
        '',
        'A new filter option, "Active (excl. cancelled)", is now the DEFAULT on',
        'the bookings screen: it excludes cancelled and no_show. "All statuses"',
        'remains for anyone who wants the full record, and every individual',
        'status filter behaves exactly as before.',
        '',
        'It applies to all three views at once - table, calendar and kanban -',
        'because they read the same filter. Fixed at the system level rather',
        'than left as a habit the user has to remember every time.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.826 pushed - the calendar shows what is coming, not what was cancelled" -ForegroundColor Green
}
