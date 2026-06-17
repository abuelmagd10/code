$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.217.ps1") { Remove-Item -LiteralPath "push_v3.74.217.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.218"') {
    Write-Host "+ 3.74.218" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath "supabase/migrations/20260617000218_v3_74_218_rename_booking_status_history_created_at.sql")) {
    Write-Host "X missing migration" -ForegroundColor Red; exit 1
}
Write-Host "+ rename migration present" -ForegroundColor Green

$route = Get-Content -LiteralPath "app/api/bookings/[id]/route.ts" -Raw
if ($route -notmatch "\.order\('changed_at'\)") {
    Write-Host "X API still does not order by changed_at" -ForegroundColor Red; exit 1
}
Write-Host "+ API orders status history by changed_at" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_218.txt"
    $msgLines = @(
        "fix(bookings): v3.74.218 - rename booking_status_history.created_at -> changed_at",
        "",
        "The detail-page user log surfaced the real cause of the broken View",
        "button: Supabase returned 400 with proxy_status PostgREST; error=",
        "42703 (undefined column) on /rest/v1/booking_status_history?...&",
        "order=changed_at.asc, so GET /api/bookings/[id] returned 500 and",
        "the page surfaced 'حدث خطأ داخلي في الخادم'.",
        "",
        "The TypeScript type BookingStatusHistory and the component",
        "BookingStatusTimeline both call this column changed_at. The table",
        "was created with created_at - mismatch.",
        "",
        "Fix: rename the column. Cleaner than dual columns or chasing the",
        "type/component through several files, and the trigger that writes",
        "into the table does not reference the column by name so the",
        "rename is safe.",
        "",
        "  supabase/migrations/20260617000218_v3_74_218_rename_booking_status_history_created_at.sql",
        "  app/api/bookings/[id]/route.ts (back to .order('changed_at'))",
        "  lib/version.ts -> 3.74.218",
        "",
        "The v3.74.217 diagnostic surface stays in place - the silent",
        "redirect to /bookings was the wrong shape regardless of this",
        "specific bug, and the next time the API fails the user will see",
        "the message instead of being bounced."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.218 pushed" -ForegroundColor Green
}
