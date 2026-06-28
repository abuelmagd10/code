$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.379.ps1") { Remove-Item -LiteralPath "push_v3.74.379.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.380"') {
    Write-Host "+ 3.74.380" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Hotfix only - no migration.
$shell = Get-Content -LiteralPath "components/app-shell.tsx" -Raw
if ($shell -notmatch '"\/suspended"') {
    Write-Host "X AppShell PUBLIC_PATHS missing /suspended" -ForegroundColor Red; exit 1
}
Write-Host "+ AppShell allows /suspended without permission gate" -ForegroundColor Green

$sidebar = Get-Content -LiteralPath "components/SidebarLayoutProvider.tsx" -Raw
if ($sidebar -notmatch '"\/suspended"') {
    Write-Host "X SidebarLayoutProvider missing /suspended" -ForegroundColor Red; exit 1
}
Write-Host "+ SidebarLayoutProvider hides sidebar on /suspended" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_380.txt"
    $msgLines = @(
        'fix(seats): v3.74.380 - /suspended redirect loop for expired members',
        '',
        'Bug report from owner: after v3.74.379 shipped, employees on',
        'expired seats see the suspended page render for a flash, then',
        'it disappears into a permanent "جاري التحميل" spinner. Console',
        'also shows "Unexpected token <, ...<!DOCTYPE..." being thrown',
        'in the suspended:1 promise rejection.',
        '',
        'Two independent issues, one combined hotfix:',
        '',
        '1. AppShell PUBLIC_PATHS missing /suspended',
        '   AppShell gates every route except a whitelist of public',
        '   pages. /suspended was not on the list. Suspended users',
        '   have no allowed pages, so:',
        '     - the suspended page rendered briefly during isLoading',
        '     - then AppShell flipped accessState to "denied"',
        '     - then router.replace(getFirstAllowedPage()) ran with',
        '       no allowed pages -> fell back to /no-access spinner',
        '   Fixed by adding /suspended to PUBLIC_PATHS so AppShell',
        '   treats it as a public landing page and never gates it.',
        '',
        '2. Sidebar mounted on /suspended caused JSON parse error',
        '   SidebarLayoutProvider rendered the global sidebar on',
        '   /suspended. The sidebar auto-polls a few APIs (approval',
        '   badges, etc.) that are not meant for suspended users -',
        '   some returned HTML (login redirect / 404 page) which the',
        '   client tried to JSON.parse and threw',
        '     "Unexpected token <, ...<!DOCTYPE..."',
        '   even though the visible page was /suspended. Hidden the',
        '   sidebar on /suspended (it has no business there - the',
        '   page is a standalone suspension landing).',
        '',
        'Net effect',
        '  Expired members now see the static /suspended page with',
        '  the precise "مقعدك رقم #X انتهت صلاحيته فى TARIKH" message',
        '  Stage 3 introduced - no flash, no spinner, no console noise.',
        '',
        'Files',
        '  components/app-shell.tsx',
        '  components/SidebarLayoutProvider.tsx',
        '  lib/version.ts -> 3.74.380'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.380 pushed - /suspended hotfix" -ForegroundColor Green
}
