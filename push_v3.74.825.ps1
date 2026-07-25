$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.824.ps1") { Remove-Item -LiteralPath "push_v3.74.824.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.825"') {
    Write-Host "+ 3.74.825" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.825]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.825]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$dc = Get-Content -LiteralPath "components/bookings/CalendarDayCell.tsx" -Raw

# --- (a) every booking is rendered, none truncated away -----------------------
if ($dc -match [regex]::Escape("bookings.slice(0, 3)")) {
    Write-Host "X the day cell still hides bookings past the third" -ForegroundColor Red; exit 1
}
# المرساة على سطر الكود لا على الكلمة: التعليق الشارح يقتبس النص القديم
# «+N أخرى» فيطابقه بحث الكلمة ويفشل الحارس ظلماً — درس فخ التعليق (793/809/810).
if ($dc -match [regex]::Escape("+{bookings.length - 3}")) {
    Write-Host "X the dead '+N more' element is still rendered" -ForegroundColor Red; exit 1
}
Write-Host "+ every booking on a day is reachable from the calendar" -ForegroundColor Green

# --- (b) it scrolls instead of stretching the month grid ----------------------
foreach ($must in @("overflow-y-auto", "max-h-[132px]")) {
    if ($dc -notmatch [regex]::Escape($must)) {
        Write-Host "X the cell would stretch and break the month grid: $must" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the cell scrolls; the month grid keeps its shape" -ForegroundColor Green

# --- (c) the user is told there is more to scroll -----------------------------
if ($dc -notmatch [regex]::Escape("MAX_VISIBLE")) {
    Write-Host "X nothing signals that the cell holds more than it shows" -ForegroundColor Red; exit 1
}
Write-Host "+ a count badge appears when the day holds more than three" -ForegroundColor Green

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
    "components/bookings/CalendarDayCell.tsx",
    "push_v3.74.825.ps1"
)
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.824.ps1" 2>$null

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_825.txt"
    $msgLines = @(
        'fix(bookings): v3.74.825 - the calendar day cell scrolls instead of',
        'hiding bookings behind "+N more"',
        '',
        'Owner report: Thursday the 16th holds four bookings, the calendar',
        'shows three and then "+1 more" - and the fourth is unreachable.',
        '',
        'The cell sliced the list at three and rendered "+N more" as inert',
        'text - not a button, not a link, opening nothing. So the fourth',
        'booking was simply invisible from the calendar, with no way to reach',
        'it short of abandoning the view for the table or kanban.',
        '',
        'Now the cell renders every booking for the day inside a vertically',
        'scrollable area capped at 132px, so the month grid keeps its shape,',
        'and a count badge next to the weekday name appears once a day holds',
        'more than three - so you know there is something to scroll to rather',
        'than discovering it by accident. Thin 1.5px scrollbar that surfaces',
        'on hover, correct in both colour modes and in RTL.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.825 pushed - no booking hides behind a dead label any more" -ForegroundColor Green
}
