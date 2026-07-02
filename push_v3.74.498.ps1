$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.497.ps1") { Remove-Item -LiteralPath "push_v3.74.497.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.498"') {
    Write-Host "+ 3.74.498" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$settings = Get-Content -LiteralPath "app/settings/page.tsx" -Raw
if ($settings -notmatch 'href="/warehouses"') {
    Write-Host "X settings page missing warehouses card" -ForegroundColor Red; exit 1
}

$sidebar = Get-Content -LiteralPath "components/sidebar.tsx" -Raw
if ($sidebar -match "href: ``/branches\$\{q\}``" -or $sidebar -match "href: ``/warehouses\$\{q\}``" -or $sidebar -match "href: ``/cost-centers\$\{q\}``") {
    Write-Host "X sidebar still contains branches/cost-centers/warehouses links" -ForegroundColor Red; exit 1
}
Write-Host "+ warehouses card added, 3 sidebar links removed" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_498.txt"
    $msgLines = @(
        'feat(nav): v3.74.498 - warehouses card in settings, slimmer sidebar',
        '',
        'Owner request: Branches / Cost Centers / Warehouses lived both as',
        'sidebar links (Settings group) and as quick-link cards inside the',
        'Settings page - except Warehouses, which had no card.',
        '',
        '- Settings page: added a Warehouses card (amber, Package icon)',
        '  next to the existing Branches and Cost Centers cards.',
        '- Sidebar Settings group: removed the three duplicate links;',
        '  the group now holds General Settings + My Profile only.',
        '',
        'The /branches, /cost-centers and /warehouses pages themselves are',
        'untouched and still reachable via the cards and direct URLs -',
        'permissions and governance unchanged.',
        '',
        'Files',
        '  app/settings/page.tsx (warehouses card)',
        '  components/sidebar.tsx (settings group slimmed)',
        '  lib/version.ts -> 3.74.498'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.498 pushed - settings cards replace sidebar links" -ForegroundColor Green
}
