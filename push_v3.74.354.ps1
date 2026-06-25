$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.353.ps1") { Remove-Item -LiteralPath "push_v3.74.353.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.354"') {
    Write-Host "+ 3.74.354" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- editor accepts end_time "00:00" ----------------------------------------
$ed = Get-Content -LiteralPath "components/services/ServiceSchedulesEditor.tsx" -Raw
foreach ($n in @(
    'v3.74.354 — Treat end_time "00:00" as midnight',
    'const isMidnightEnd = row.end_time === "00:00"',
    '!isMidnightEnd'
)) {
    if ($ed -notmatch [regex]::Escape($n)) {
        Write-Host "X editor missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ editor: midnight end-time accepted" -ForegroundColor Green

# ---- form mirrors the rule at submit ----------------------------------------
$sf = Get-Content -LiteralPath "components/services/ServiceForm.tsx" -Raw
foreach ($n in @(
    'v3.74.354 — "00:00" on the end side is treated as end-of-day',
    'r.end_time !== "00:00"'
)) {
    if ($sf -notmatch [regex]::Escape($n)) {
        Write-Host "X ServiceForm missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ ServiceForm: submit gate matches" -ForegroundColor Green

# ---- availability route handles midnight end --------------------------------
$av = Get-Content -LiteralPath "app/api/bookings/availability/route.ts" -Raw
foreach ($n in @(
    'v3.74.354 — end_time "00:00" is the editor',
    'eh === 0 && em === 0 ? 24 * 60'
)) {
    if ($av -notmatch [regex]::Escape($n)) {
        Write-Host "X availability route missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ availability route: 00:00 mapped to 24:00" -ForegroundColor Green

# ---- type-check --------------------------------------------------------------
Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ---- commit + push -----------------------------------------------------------
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_354.txt"
    $msgLines = @(
        'fix(services): v3.74.354 - allow "until midnight" service work hours',
        '',
        'Owner: tried to save a Sunday schedule of 06:00 PM -> 12:00 AM',
        '(18:00 -> 00:00, i.e. evening shift ending at midnight) and the',
        'editor rejected it with "وقت النهاية يجب أن يكون بعد وقت',
        'البداية". The validation was a flat lexicographic compare:',
        '  row.end_time <= row.start_time  // "00:00" <= "18:00" -> true',
        'so any shift ending at midnight failed.',
        '',
        'Decision',
        '  Treat end_time = "00:00" as the editor''s encoding for',
        '  "midnight at the end of the day" (i.e. 24:00). This is the',
        '  same convention native HTML time inputs force you into',
        '  because <input type="time"> cannot represent 24:00.',
        '',
        'Changes',
        '  1. ServiceSchedulesEditor: timeInvalid skips the lexicographic',
        '     compare when end_time is exactly "00:00".',
        '  2. ServiceForm.handleSubmit: same exception in the submit-time',
        '     guard so the editor and form agree.',
        '  3. /api/bookings/availability: when generating slot windows,',
        '     a row whose end_time parses to 00:00 is mapped to 1440',
        '     minutes (24:00) so the while loop actually produces slots',
        '     up to midnight instead of zero slots.',
        '',
        'Out of scope',
        '  Genuine overnight shifts (e.g. 22:00 -> 02:00 of the next day)',
        '  still need to be modeled as two rows on two day_of_week values.',
        '  The owner only asked for the until-midnight case.',
        '',
        'Files',
        '  components/services/ServiceSchedulesEditor.tsx',
        '  components/services/ServiceForm.tsx',
        '  app/api/bookings/availability/route.ts',
        '  lib/version.ts -> 3.74.354'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.354 pushed" -ForegroundColor Green
}
