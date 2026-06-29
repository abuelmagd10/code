$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.387.ps1") { Remove-Item -LiteralPath "push_v3.74.387.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.388"') {
    Write-Host "+ 3.74.388" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260629000388_v3_74_388_seat_status_expired_count.sql"
if (Test-Path -LiteralPath $mig) {
    Write-Host "+ migration 388" -ForegroundColor Green
} else { Write-Host "X missing migration 388" -ForegroundColor Red; exit 1 }

$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @('get_seat_status', 'expired_seat_count', 'active_seat_count', 'v_expired_count', 'v_active_count')) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration exposes expired_seat_count + active_seat_count" -ForegroundColor Green

$banner = Get-Content -LiteralPath "components/billing/SeatStatusBanner.tsx" -Raw
foreach ($n in @('expired_seat_count', 'active_seat_count', "تجديد مقعد منتهى", "مقعد منتهى الصلاحية", '/settings/seats')) {
    if ($banner -notmatch [regex]::Escape($n)) {
        Write-Host "X banner missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ banner shows expired count + renewal link" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_388.txt"
    $msgLines = @(
        'fix(invite-banner): v3.74.388 - explain WHY no seats are available',
        '',
        'Owner reported confusing UX during invite testing on شركة تست:',
        '  "5 مستخدمة من إجمالى 10 مقعد مدفوع"',
        '  "لا توجد مقاعد متاحة"',
        '',
        'The two lines contradict each other on the surface (5 of 10',
        'used should mean 5 free) but the real reason no seat was',
        'available is that 5 of the 10 seats were EXPIRED. The banner',
        'never surfaced expiry, only occupancy.',
        '',
        'Fix',
        '  DB - get_seat_status RPC now also returns:',
        '       expired_seat_count - how many licenses have expired',
        '       active_seat_count  - how many licenses are still valid',
        '       (body otherwise byte-identical to v3.74.383)',
        '  UI - SeatStatusBanner "no available seats" variant rewrites',
        '       the breakdown to show:',
        '         N مقعد نشط مشغول بموظف',
        '         M محجوز لدعوات معلقة (when > 0)',
        '         X مقعد منتهى الصلاحية يحتاج تجديد (when > 0)',
        '         المتاحة دلوقتى: 0',
        '       and adds a "تجديد مقعد منتهى" button next to the',
        '       existing "إضافة مقعد شهرى" — linking to /settings/seats',
        '       where Stage 5 renewal flow already lives.',
        '',
        'Backward compatibility',
        '  - Old payload without expired_seat_count: the banner still',
        '    renders with the renewal button hidden (falls back via ??).',
        '  - Variant for total_paid_seats=0 (free tier) unchanged.',
        '  - "Seats available" variant unchanged.',
        '',
        'Files',
        '  supabase/migrations/20260629000388_v3_74_388_seat_status_expired_count.sql',
        '  components/billing/SeatStatusBanner.tsx',
        '  lib/version.ts -> 3.74.388',
        '',
        'Note',
        '  Migration applied to live DB via Supabase MCP.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.388 pushed - invite banner explains expired seats" -ForegroundColor Green
}
