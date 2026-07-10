$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.593.ps1") { Remove-Item -LiteralPath "push_v3.74.593.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.594"') {
    Write-Host "+ 3.74.594" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$ba = Get-Content -LiteralPath "components/bookings/BookingAddons.tsx" -Raw
# القسمان بالترتيب الجديد: extras أولاً ثم bundle
$extrasPos = $ba.IndexOf('Walk-in Extras')
$bundlePos = $ba.IndexOf('Attached Bundle Items')
if ($extrasPos -lt 0 -or $bundlePos -lt 0 -or $extrasPos -gt $bundlePos) {
    Write-Host "X sections not reordered (extras must precede bundle)" -ForegroundColor Red; exit 1
}
if ($ba -match 'side="top"') {
    Write-Host "X stale side=top still present" -ForegroundColor Red; exit 1
}
Write-Host "+ walk-in extras section moved above bundle items" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 30 | ForEach-Object { Write-Host $_ }
    exit 1
}

# ⚠️ الشجرة بها آلاف ملفات ضجيج نهايات أسطر — الرفع انتقائى حصراً
git add -- `
    "components/bookings/BookingAddons.tsx" `
    "lib/version.ts" `
    "push_v3.74.594.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.593.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_594.txt"
    $msgLines = @(
        'fix(bookings): v3.74.594 - walk-in extras section moved above bundle items',
        '',
        'Owner decision after v3.74.592/593: radix kept placing the',
        'product picker popup below the trigger regardless of side=top',
        '(even with avoidCollisions off, verified in incognito), and the',
        'extras section sat at the very bottom of the page, squeezing the',
        'popup into the leftover viewport space.',
        '',
        'Simplest robust fix: reorder the two cards - walk-in extras now',
        'renders ABOVE attached bundle items, giving the dropdown ample',
        'room to unfold downward naturally. side=top usage removed',
        '(the optional prop stays on ProductSearchSelect, harmless).'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.594 pushed - extras section relocated" -ForegroundColor Green
}
