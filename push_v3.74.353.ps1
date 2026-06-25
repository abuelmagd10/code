$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.352.ps1") { Remove-Item -LiteralPath "push_v3.74.352.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.353"') {
    Write-Host "+ 3.74.353" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- ServiceSchedulesEditor uses per-input labels ---------------------------
$ed = Get-Content -LiteralPath "components/services/ServiceSchedulesEditor.tsx" -Raw
foreach ($n in @(
    'v3.74.353 — Drop the floating header row',
    '"بداية", "Start"',
    '"نهاية", "End"',
    'dir="ltr"'
)) {
    if ($ed -notmatch [regex]::Escape($n)) {
        Write-Host "X ServiceSchedulesEditor missing: $n" -ForegroundColor Red; exit 1
    }
}
# Header row should not exist any more
if ($ed -match '<span>{t\("اليوم", "Day"\)}</span>') {
    Write-Host "X ServiceSchedulesEditor still has the old header row" -ForegroundColor Red; exit 1
}
Write-Host "+ ServiceSchedulesEditor: per-input labels with explicit dir" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_353.txt"
    $msgLines = @(
        'fix(services): v3.74.353 - service work hours stop tricking users in RTL',
        '',
        'Owner: the work-hours editor on the new-service form had four',
        'columns - Day, From, To, Active - and the From/To header cells',
        'were a floating row above the inputs. In Arabic (RTL) CSS Grid',
        'flips the column order visually, so users were filling the',
        'start time into the visual "إلى" slot and the end time into',
        '"من". That is exactly how some services ended up saved as',
        '00:00 -> 18:00 instead of the intended 09:00 -> 18:00.',
        '',
        'Change',
        '  - Dropped the floating header row entirely.',
        '  - Each input now carries its own label welded right next to',
        '    it ("بداية" / "نهاية"), so the meaning is impossible to',
        '    misread regardless of script direction.',
        '  - Set dir="ltr" on the time inputs themselves (time values',
        '    are intrinsically LTR), keeping the row dir-aware.',
        '  - Used flex + ms-auto so the Active toggle still sits at the',
        '    visual end of the row in both directions.',
        '',
        'Files',
        '  components/services/ServiceSchedulesEditor.tsx',
        '  lib/version.ts -> 3.74.353'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.353 pushed" -ForegroundColor Green
}
