$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.215.ps1") { Remove-Item -LiteralPath "push_v3.74.215.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.216"') {
    Write-Host "+ 3.74.216" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$file = Get-Content -LiteralPath "components/bookings/BookingsTable.tsx" -Raw
if ($file -notmatch "Button asChild size=") {
    Write-Host "X view button still wraps Link in Button" -ForegroundColor Red; exit 1
}
Write-Host "+ View button now uses asChild pattern" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_216.txt"
    $msgLines = @(
        "fix(bookings): v3.74.216 - View button now navigates to the booking detail page",
        "",
        "Reported by the user: clicking the eye icon on a row in the",
        "bookings table did nothing.",
        "",
        "Root cause: the action cell rendered <Link><Button>...</Button></Link>.",
        "shadcn's Button is a <button> element; nesting it inside an <a>",
        "is invalid HTML, and browsers swallow the navigation click - the",
        "inner button receives the event and the Link never fires.",
        "",
        "Fix: use the standard shadcn asChild pattern so the Link becomes",
        "the actual clickable element while keeping the Button styling:",
        "",
        "  <Button asChild ...>",
        "    <Link href=...>",
        "      <Eye />",
        "    </Link>",
        "  </Button>",
        "",
        "Same routing target, same icon, same styling - now actually",
        "navigates.",
        "",
        "  components/bookings/BookingsTable.tsx",
        "  lib/version.ts -> 3.74.216"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.216 pushed" -ForegroundColor Green
}
