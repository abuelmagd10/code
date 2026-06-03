# v3.62.5 - Sentry error monitoring integration (P0-2)
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan

$files = @(
    "lib/version.ts",
    "instrumentation.ts",
    "instrumentation-client.ts",
    "sentry.client.config.ts",
    "sentry.server.config.ts",
    "sentry.edge.config.ts",
    "lib/sentry-user.ts",
    "lib/access-context.tsx",
    "next.config.mjs",
    "app/api/sentry-test/route.ts"
)
foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.62.5"') { Write-Host "  + APP_VERSION = 3.62.5" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.62.5" -ForegroundColor Red; exit 1 }

$nc = Get-Content -LiteralPath "next.config.mjs" -Raw
if ($nc -match 'withSentryConfig' -and $nc -match 'org: "7esaberb"' -and $nc -match 'project: "7esab-erb"') {
    Write-Host "  + next.config wrapped with withSentryConfig" -ForegroundColor Green
} else { Write-Host "  X next.config not wired" -ForegroundColor Red; exit 1 }

$cli = Get-Content -LiteralPath "sentry.client.config.ts" -Raw
if ($cli -match 'release:' -and $cli -match 'beforeSend' -and $cli -match 'ignoreErrors') {
    Write-Host "  + client config has release + filters + scrub" -ForegroundColor Green
} else { Write-Host "  X client config incomplete" -ForegroundColor Red; exit 1 }

$ac = Get-Content -LiteralPath "lib/access-context.tsx" -Raw
if ($ac -match 'setSentryUser') {
    Write-Host "  + access-context wires user identity to Sentry" -ForegroundColor Green
} else { Write-Host "  X user identity not tagged" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add `
    lib/version.ts `
    instrumentation.ts `
    instrumentation-client.ts `
    sentry.client.config.ts `
    sentry.server.config.ts `
    sentry.edge.config.ts `
    lib/sentry-user.ts `
    lib/access-context.tsx `
    next.config.mjs `
    app/api/sentry-test/route.ts `
    CHANGELOG.md 2>&1 | Out-Null

git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "feat(observability): v3.62.5 - Sentry error monitoring (P0-2)

Wires @sentry/nextjs into the app. Every uncaught error in client, server,
or edge runtime now reports to Sentry with full stack trace, release tag,
and user identity.

Sentry project: 7esaberb / 7esab-erb

What was added:
  - instrumentation.ts + instrumentation-client.ts (Next.js 15 hooks)
  - lib/sentry-user.ts (tags user.id + company_id + role on every event)
  - access-context.tsx calls setSentryUser after auth bootstrap
  - next.config.mjs wrapped with withSentryConfig
  - source maps upload at build time, symbolicated stack traces in dashboard
  - tunnel route /monitoring so ad-blockers cannot drop events
  - app/api/sentry-test/route.ts for end-to-end verification

Noise reduction:
  - ignoreErrors covers ResizeObserver loops, extension noise, network blips,
    and the known Vercel feedback widget InvalidNodeTypeError
  - denyUrls drops events from vercel.live/* and browser extensions
  - beforeSend strips Authorization/Cookie/x-supabase-auth headers from
    breadcrumbs so secrets never reach Sentry

Sampling:
  - traces: 10% prod / 100% dev
  - session replay: 5% normal sessions / 100% error sessions

DSN: hardcoded fallback to the production DSN (DSNs are public per Sentry
design). Optionally override via NEXT_PUBLIC_SENTRY_DSN on Vercel for
staging/preview environments.

Files:
  New: instrumentation.ts, instrumentation-client.ts
  New: lib/sentry-user.ts
  New: app/api/sentry-test/route.ts
  Modified: sentry.{client,server,edge}.config.ts (release + filters + scrub)
  Modified: next.config.mjs (withSentryConfig)
  Modified: lib/access-context.tsx (setSentryUser on bootstrap)
  Modified: lib/version.ts (3.62.4 -> 3.62.5)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.62.5 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verify after Vercel deploys (~2 min):" -ForegroundColor Cyan
    Write-Host "  1. Visit https://7esab.com/api/sentry-test?confirm=1" -ForegroundColor White
    Write-Host "     Expect 200 + a new event in Sentry within 30 sec" -ForegroundColor Gray
    Write-Host "  2. Open Sentry dashboard - the event should carry tags:" -ForegroundColor White
    Write-Host "     user.id, company_id, role=owner" -ForegroundColor Gray
    Write-Host "  3. Trigger any client-side error - session replay attached" -ForegroundColor White
}
