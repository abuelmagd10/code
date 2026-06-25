$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.354.ps1") { Remove-Item -LiteralPath "push_v3.74.354.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.355"') {
    Write-Host "+ 3.74.355" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- Zod schema accepts end_time "00:00" ------------------------------------
$ba = Get-Content -LiteralPath "lib/services/booking-api.ts" -Raw
foreach ($n in @(
    "v3.74.355 — Treat end_time ""00:00"" as midnight",
    "d.end_time === '00:00' || d.end_time > d.start_time"
)) {
    if ($ba -notmatch [regex]::Escape($n)) {
        Write-Host "X booking-api missing: $n" -ForegroundColor Red; exit 1
    }
}
# Make sure the old strict rule no longer ships unchanged
if ($ba -match '\.refine\(\(d\) => d\.end_time > d\.start_time') {
    Write-Host "X booking-api still has the strict refine without midnight exception" -ForegroundColor Red; exit 1
}
Write-Host "+ booking-api: Zod accepts midnight end-time" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_355.txt"
    $msgLines = @(
        'fix(services): v3.74.355 - server-side Zod also accepts midnight end-time',
        '',
        'Symptom (owner, June 24 2026):',
        '  After v3.74.354 the editor and submit-time guard both accepted',
        '  18:00 -> 00:00 (evening shift ending at midnight), but the PUT',
        '  /api/services/<id>/schedules came back as HTTP 422 because the',
        '  Zod upsertScheduleSchema kept its strict',
        '      d.end_time > d.start_time',
        '  refine. Server rejected the same payload the UI happily',
        '  produced.',
        '',
        'Fix',
        '  upsertScheduleSchema.refine now permits end_time exactly equal',
        '  to "00:00" (the canonical encoding for end-of-day, since',
        '  <input type=time> cannot emit 24:00). All other end < start',
        '  cases still fail the same way they did before.',
        '',
        'Files',
        '  lib/services/booking-api.ts',
        '  lib/version.ts -> 3.74.355'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.355 pushed" -ForegroundColor Green
}
