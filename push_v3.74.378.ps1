$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.377.ps1") { Remove-Item -LiteralPath "push_v3.74.377.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.378"') {
    Write-Host "+ 3.74.378" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Stage 2 is pure code (no DB migration this version).
$api = "app/api/billing/seats/assignments/route.ts"
if (-not (Test-Path -LiteralPath $api)) { Write-Host "X missing assignments route" -ForegroundColor Red; exit 1 }
$apiContent = Get-Content -LiteralPath $api -Raw
foreach ($n in @(
    'company_seat_licenses',
    'license_id',
    'is_expired',
    'expired_seat_count',
    'licensesBySeat'
)) {
    if ($apiContent -notmatch [regex]::Escape($n)) {
        Write-Host "X assignments route missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ assignments route reads company_seat_licenses" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/settings/seats/page.tsx" -Raw
foreach ($n in @(
    'license_id',
    'purchased_at',
    'expires_at',
    'is_expired',
    'صلاحية المقعد',
    'expired_seat_count',
    'مقعد منتهى الصلاحية'
)) {
    if ($page -notmatch [regex]::Escape($n)) {
        Write-Host "X seats page missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ seats page renders per-seat dates and expired badges" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_378.txt"
    $msgLines = @(
        'feat(seats): v3.74.378 - per-seat dates in /settings/seats (Stage 2 of 6)',
        '',
        'Stage 2 of the seat-license rollout: surface the per-seat',
        'license dates that Stage 1 backfilled. Read-only — the',
        'middleware, the suspension page, the swap RPC, and the buy',
        'flow all still operate on the legacy model. Only the owner-',
        'facing /settings/seats inbox is aware of the new dates.',
        '',
        'API',
        '  GET /api/billing/seats/assignments',
        '    - Pulls company_seat_licenses for the active company',
        '      (was only reading company_seats.total_paid_seats +',
        '      company_members.seat_number)',
        '    - Each seat row gets new fields:',
        '        license_id, purchased_at, expires_at, is_expired',
        '    - Top-level response gets expired_seat_count alongside',
        '      the existing over_quota_count',
        '    - Backward compatible: existing consumers see all the',
        '      old fields with their old shapes.',
        '    - role enum extended with "expired" for occupied seats',
        '      whose license has passed expires_at.',
        '',
        'UI (/settings/seats)',
        '  - New orange alert "X مقعد منتهى الصلاحية" mirrors the',
        '    existing red "محظور" alert (only renders when count > 0).',
        '  - The seats table replaces the old "تاريخ الإضافة" column',
        '    with "صلاحية المقعد" showing:',
        '        اشترى: <date>',
        '        ينتهى: <date> (<days remaining or days since>)',
        '    The "ينتهى" line is coloured orange for expired and',
        '    amber when 3 days or fewer remain.',
        '  - New seat status badge "منتهى" (orange + clock icon) for',
        '    occupied expired seats. Empty expired seats show',
        '    "متاح (منتهى)".',
        '  - Row background tinted orange for expired-occupied rows.',
        '',
        'Behavior unchanged this stage',
        '  - Middleware still uses get_user_company_status RPC.',
        '  - Arrow buttons still call swap_seat_numbers (will be',
        '    rewritten in Stage 3 to move users between licenses).',
        '  - Buy/checkout flow still creates seats via the legacy',
        '    increase_seats RPC (Stage 4 will swap to per-seat rows).',
        '',
        'Next stages',
        '  v3.74.379 - arrows move users between seats',
        '  v3.74.380 - buying creates per-seat licenses',
        '  v3.74.381 - renewal flow (one / many / all expired)',
        '  v3.74.382 - invitation flow + suspended page polish',
        '',
        'Files',
        '  app/api/billing/seats/assignments/route.ts',
        '  app/settings/seats/page.tsx',
        '  lib/version.ts -> 3.74.378'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.378 pushed - per-seat dates visible in /settings/seats" -ForegroundColor Green
}
