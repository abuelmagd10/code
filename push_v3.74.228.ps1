$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.227.ps1") { Remove-Item -LiteralPath "push_v3.74.227.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.228"') {
    Write-Host "+ 3.74.228" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

# Guard 1: /demo is in SidebarLayoutProvider hide-list
$slp = Get-Content -LiteralPath "components/SidebarLayoutProvider.tsx" -Raw
if ($slp -notmatch '"/demo"') {
    Write-Host "X SidebarLayoutProvider still shows the app sidebar on /demo" -ForegroundColor Red; exit 1
}
Write-Host "+ /demo hides the app sidebar" -ForegroundColor Green

# Guard 2: /demo is in AppShell PUBLIC_PATHS
$as = Get-Content -LiteralPath "components/app-shell.tsx" -Raw
if ($as -notmatch '"/demo"') {
    Write-Host "X AppShell still treats /demo as a permission-gated route" -ForegroundColor Red; exit 1
}
Write-Host "+ /demo is treated as a public marketing route" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_228.txt"
    $msgLines = @(
        "fix(demo): v3.74.228 - /demo renders full-bleed, no app sidebar bleed-through",
        "",
        "Observation from the v3.74.227 deployment test: navigating to",
        "/demo while logged in showed the authenticated app sidebar",
        "(لوحة التحكم، المبيعات، المخزون، ...) on the right edge of the",
        "screen, overlapping the demo canvas. Visually it broke the demo",
        "into 'app on the right, demo on the left' instead of a clean",
        "marketing page.",
        "",
        "Root cause: /demo wasn't in the public-path lists.",
        "  - SidebarLayoutProvider.tsx mounts <Sidebar /> on every route",
        "    not in PREFIX_HIDE_PATHS. /demo wasn't there, so the sidebar",
        "    rendered. Same pattern as /legal, /contact, /blog.",
        "  - AppShell.tsx PUBLIC_PATHS controls whether the route is",
        "    permission-gated. /demo missing meant logged-out visitors",
        "    arriving from the landing-page CTA would have been bounced",
        "    to /no-access or the login redirect.",
        "",
        "Fix: add '/demo' to both lists. Demo page now renders edge-to-",
        "edge for everyone, signed in or out.",
        "",
        "  components/SidebarLayoutProvider.tsx",
        "  components/app-shell.tsx",
        "  lib/version.ts -> 3.74.228"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.228 pushed" -ForegroundColor Green
}
