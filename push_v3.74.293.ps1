$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.292.ps1") { Remove-Item -LiteralPath "push_v3.74.292.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.293"') {
    Write-Host "+ 3.74.293" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$si = Get-Content -LiteralPath "app/api/send-invite/route.ts" -Raw
if ($si -notmatch 'seat_reserved:\s*false') {
    Write-Host "X send-invite still inserts seat_reserved:true (race condition)" -ForegroundColor Red; exit 1
}
Write-Host "+ send-invite: insert uses seat_reserved=false (RPC flips it)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_293.txt"
    $msgLines = @(
        'fix(invite): v3.74.293 - send-invite race condition rejected itself',
        '',
        'Tester reported "لا توجد مقاعد متاحة" right after buying a seat with',
        'the TEST100 100%-off coupon, even though the seat-status banner on',
        'the same screen said "1 مقعد متاح" and the get_seat_status RPC',
        'returned can_invite:true / available_seats:1.',
        '',
        'Root cause - the send-invite route raced against itself:',
        '',
        '  1. INSERT INTO company_invitations (..., seat_reserved=TRUE)',
        '  2. await reserve_seat(company, invite_id)',
        '       which calls get_seat_status, which counts every row',
        '       with seat_reserved=TRUE as a "pending reservation".',
        '       Because step 1 just inserted such a row, the count goes',
        '       1 - 0(active) - 1(this row) = 0 available_seats, the',
        '       RPC bails with no_seats_available, and the route deletes',
        '       the row it just inserted and returns 402.',
        '',
        'Fix: insert with seat_reserved=FALSE. The reserve_seat RPC is the',
        'one piece allowed to set it to true, and it does so under an',
        'advisory lock *after* confirming availability. With the insert',
        'flag corrected, get_seat_status no longer double-counts the row,',
        'reserve_seat succeeds, and the invitation is created.',
        '',
        'Files',
        '  app/api/send-invite/route.ts',
        '  lib/version.ts -> 3.74.293'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.293 pushed" -ForegroundColor Green
}
