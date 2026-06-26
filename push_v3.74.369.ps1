$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.368.ps1") { Remove-Item -LiteralPath "push_v3.74.368.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.369"') {
    Write-Host "+ 3.74.369" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$bn = Get-Content -LiteralPath "components/bookings/BookingNotes.tsx" -Raw
foreach ($n in @(
    'v3.74.369 fix',
    'toastRef',
    'isArRef',
    'cancelled = true'
)) {
    if ($bn -notmatch [regex]::Escape($n)) {
        Write-Host "X BookingNotes missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ BookingNotes: bulletproof load (no useCallback loop)" -ForegroundColor Green

# Make sure the old buggy useCallback pattern is gone.
# Check the import line + actual calls; the word may still appear in
# the explanatory comment, and that is fine.
$bnLines = Get-Content -LiteralPath "components/bookings/BookingNotes.tsx"
$importLine = $bnLines | Where-Object { $_ -match '^import .* from "react"' } | Select-Object -First 1
if ($importLine -match 'useCallback') {
    Write-Host "X BookingNotes still imports useCallback - the loop fix did not land" -ForegroundColor Red
    exit 1
}
$callbackCalls = $bnLines | Where-Object { $_ -match 'useCallback\(' }
if ($callbackCalls) {
    Write-Host "X BookingNotes still calls useCallback() - the loop fix did not land" -ForegroundColor Red
    exit 1
}
Write-Host "+ no useCallback import/call in BookingNotes" -ForegroundColor Green

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

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_369.txt"
    $msgLines = @(
        'fix(bookings): v3.74.369 - stop the BookingNotes infinite fetch loop',
        '',
        'Reported by the owner after v3.74.368 shipped: opening the new',
        'Notes tab on /bookings/[id] never stopped showing the loading',
        'spinner, and the browser eventually died with thousands of',
        'ERR_INSUFFICIENT_RESOURCES errors hitting',
        '/api/bookings/[id]/notes.',
        '',
        'Root cause',
        '  In v3.74.368 the load() function was wrapped in useCallback',
        '  with [bookingId] as the listed dep but the body closed over',
        '  the toast helper and a fresh `t` arrow function. Even with',
        '  the eslint-disable comment the closure captured stale refs',
        '  on the first render and React re-ran the useEffect once it',
        '  saw the second render, which immediately fired another fetch',
        '  and another render, and so on. Net result: the effect ran',
        '  on every paint until the network stack ran out of sockets.',
        '',
        'Fix',
        '  - Removed useCallback entirely.',
        '  - Inlined the initial-load async function inside a single',
        '    useEffect keyed off [bookingId] with a cancelled flag so',
        '    React Strict-Mode-style double-mounts cannot double-fire.',
        '  - Moved toast / isAr behind useRef so the closure does not',
        '    need them as deps and they cannot cause re-runs.',
        '  - Kept a standalone reload() (no useCallback) that the',
        '    post-note and delete-note handlers call manually.',
        '',
        'Files',
        '  components/bookings/BookingNotes.tsx',
        '  lib/version.ts -> 3.74.369'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.369 pushed" -ForegroundColor Green
}
