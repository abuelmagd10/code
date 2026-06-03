# v3.63.2 - Dashboard cold-start polish
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan
foreach ($f in @("lib/version.ts", "app/dashboard/loading.tsx", "app/layout.tsx")) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.63.2"') { Write-Host "  + APP_VERSION = 3.63.2" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.63.2" -ForegroundColor Red; exit 1 }

$loading = Get-Content -LiteralPath "app/dashboard/loading.tsx" -Raw
if ($loading -match 'StatsSkeleton' -and $loading -match 'BankCashSkeleton') {
    Write-Host "  + loading.tsx uses widget skeletons" -ForegroundColor Green
} else { Write-Host "  X loading.tsx incomplete" -ForegroundColor Red; exit 1 }

$layout = Get-Content -LiteralPath "app/layout.tsx" -Raw
if ($layout -match 'rel="preconnect"' -and $layout -match 'supabase.co') {
    Write-Host "  + preconnect hint added" -ForegroundColor Green
} else { Write-Host "  X preconnect not added" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts app/dashboard/loading.tsx app/layout.tsx CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "perf(dashboard): v3.63.2 - cold-start polish (loading.tsx + preconnect)

app/dashboard/loading.tsx - Next.js shows this skeleton the moment
the route transition begins, before page.tsx runs at all. Earlier
the Suspense fallbacks only kicked in AFTER auth + company lookup
completed - on a cold Vercel function start that meant 5-10 seconds
of blank screen. Now the user sees a stable layout (header card +
4 KPI tiles + chart strips + bank/list grid) within the first frame.

app/layout.tsx - preconnect + dns-prefetch hints in the head pointing
at the Supabase project URL. Browsers open the TCP + TLS connection
while parsing the HTML, so the first auth/data fetch saves roughly
100-300ms on cold loads. crossOrigin='anonymous' so the auth cookie
is not sent on the warm-up handshake.

Why this matters: first-time visitors on a cold function load saw
a flash of nothing for several seconds and bounced before the
dashboard had a chance to render. Now they see structure immediately
and watch the data fill in.

Files:
  New: app/dashboard/loading.tsx
  Modified: app/layout.tsx (two link hints)
  Modified: lib/version.ts (3.63.1 -> 3.63.2)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.63.2 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verify after Vercel deploys (~2 min):" -ForegroundColor Cyan
    Write-Host "  1. Clear cache, hard-reload /dashboard - skeleton paints in <500ms" -ForegroundColor White
    Write-Host "  2. DevTools Network - preconnect to Supabase ~50ms after HTML" -ForegroundColor White
}
