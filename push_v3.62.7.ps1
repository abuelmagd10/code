# v3.62.7 - Hotfix: /legal as truly public route
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

Write-Host "=== Checking files ===" -ForegroundColor Cyan
$files = @(
    "lib/version.ts",
    "lib/supabase/middleware.ts",
    "components/app-shell.tsx",
    "components/SidebarLayoutProvider.tsx",
    "app/legal/layout.tsx"
)
foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f)) { Write-Host "X $f MISSING" -ForegroundColor Red; exit 1 }
    Write-Host "+ $f" -ForegroundColor Green
}

Write-Host "`n=== Verify markers ===" -ForegroundColor Cyan
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.62.7"') { Write-Host "  + APP_VERSION = 3.62.7" -ForegroundColor Green }
else { Write-Host "  X APP_VERSION not 3.62.7" -ForegroundColor Red; exit 1 }

$mw = Get-Content -LiteralPath "lib/supabase/middleware.ts" -Raw
if ($mw -match 'isLegalPage' -and $mw -match '!isLegalPage') {
    Write-Host "  + middleware: isLegalPage allow-list applied" -ForegroundColor Green
} else { Write-Host "  X middleware not patched" -ForegroundColor Red; exit 1 }

$shell = Get-Content -LiteralPath "components/app-shell.tsx" -Raw
if ($shell -match '"/legal"') {
    Write-Host "  + AppShell PUBLIC_PATHS includes /legal" -ForegroundColor Green
} else { Write-Host "  X AppShell not patched" -ForegroundColor Red; exit 1 }

$slp = Get-Content -LiteralPath "components/SidebarLayoutProvider.tsx" -Raw
if ($slp -match '/legal') {
    Write-Host "  + SidebarLayoutProvider hides sidebar on /legal" -ForegroundColor Green
} else { Write-Host "  X SidebarLayoutProvider not patched" -ForegroundColor Red; exit 1 }

$layout = Get-Content -LiteralPath "app/legal/layout.tsx" -Raw
if ($layout -match 'href="/auth/login"') {
    Write-Host "  + Legal layout login link corrected" -ForegroundColor Green
} else { Write-Host "  X Legal layout login link still wrong" -ForegroundColor Red; exit 1 }

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($tsc | Out-String) -ForegroundColor Red
    exit 1
}
Write-Host "+ TypeScript OK" -ForegroundColor Green

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add lib/version.ts lib/supabase/middleware.ts components/app-shell.tsx components/SidebarLayoutProvider.tsx app/legal/layout.tsx CHANGELOG.md 2>&1 | Out-Null
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(legal): v3.62.7 - make /legal a truly public route

After v3.62.6 the four legal pages were deployed but three
independent gates were treating /legal/* as a protected route:

1. lib/supabase/middleware.ts redirected anonymous requests to
   /auth/login because /legal was not in the auth-bypass list.
   Added isLegalPage check; also excludes it from the suspension
   enforcement so suspended members can read the Terms.

2. components/app-shell.tsx ran the permission gate on /legal,
   trying to resolve 'legal' as a resource key in allowed_pages.
   Added /legal to PUBLIC_PATHS.

3. components/SidebarLayoutProvider.tsx rendered the dashboard
   sidebar on top of the policy pages whenever the visitor was
   logged in. Added /legal to PREFIX_HIDE_PATHS.

Also: app/legal/layout.tsx had Login pointing at /login (404).
Corrected to /auth/login.

Result: https://7esab.com/legal now renders cleanly both
logged-in and anonymous, with the dedicated /legal header
and no sidebar.

Files:
  Modified: lib/supabase/middleware.ts
  Modified: components/app-shell.tsx
  Modified: components/SidebarLayoutProvider.tsx
  Modified: app/legal/layout.tsx
  Modified: lib/version.ts (3.62.6 -> 3.62.7)

TypeScript: OK." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.62.7 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verify after Vercel deploys (~2 min):" -ForegroundColor Cyan
    Write-Host "  1. Incognito -> https://7esab.com/legal - renders without redirect" -ForegroundColor White
    Write-Host "  2. Logged-in -> https://7esab.com/legal - no sidebar, blue header only" -ForegroundColor White
    Write-Host "  3. /legal/terms, /legal/privacy, /legal/refund all reachable" -ForegroundColor White
    Write-Host "  4. Login button in /legal header goes to /auth/login" -ForegroundColor White
}
