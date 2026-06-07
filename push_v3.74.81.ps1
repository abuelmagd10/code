# v3.74.81 - useAutoRefresh perf hardening
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.81"') { Write-Host "+ APP_VERSION = 3.74.81" -ForegroundColor Green } else { Write-Host "X APP_VERSION not 3.74.81" -ForegroundColor Red; exit 1 }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -match [regex]::Escape('[3.74.81]')) { Write-Host "+ CHANGELOG 3.74.81" -ForegroundColor Green } else { Write-Host "X CHANGELOG missing 3.74.81" -ForegroundColor Red; exit 1 }

$hook = Get-Content -LiteralPath "hooks/use-auto-refresh.ts" -Raw
if ($hook -match 'v3\.74\.81' -and $hook -match 'skipIfHidden' -and $hook -match 'useRef<number>\(Date\.now\(\)\)' -and $hook -match 'minIntervalMs = options\.minIntervalMs \?\? 30000') {
    Write-Host "+ hook has all 4 v3.74.81 markers" -ForegroundColor Green
} else { Write-Host "X hook markers missing" -ForegroundColor Red; exit 1 }

# Heavy pages opted into skipIfHidden
$heavy = @(
    "app/invoices/page.tsx",
    "app/customers/page.tsx",
    "app/products/page.tsx",
    "app/sales-orders/page.tsx",
    "app/bills/page.tsx"
)
foreach ($f in $heavy) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -match 'skipIfHidden: true') {
        Write-Host "+ $f opted in" -ForegroundColor Green
    } else {
        Write-Host "X $f missing skipIfHidden" -ForegroundColor Red; exit 1
    }
    if (-not $c.TrimEnd().EndsWith("}")) {
        Write-Host "X $f does not end with }" -ForegroundColor Red; exit 1
    }
}

Write-Host "`n=== TypeScript check ===" -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$pattern = "use-auto-refresh|invoices/page\.tsx|customers/page\.tsx|products/page\.tsx|sales-orders/page\.tsx|bills/page\.tsx"
$err = ($tsc | Select-String $pattern).Count
if ($err -eq 0) { Write-Host "+ 0 errors in touched files" -ForegroundColor Green } else { Write-Host "X $err errors" -ForegroundColor Red; $tsc | Select-String $pattern | Select-Object -First 5; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "perf: v3.74.81 - useAutoRefresh fixes (mount double-fetch, throttle, skipIfHidden)

User noticed pages feel slow when navigating and worried that heavy
pages would suffer more as data grows. Three real issues in
hooks/use-auto-refresh.ts:

1. Double-fetch on mount: lastRunRef started at 0, so the first focus
   event after mount always passed the throttle check (Date.now() - 0
   > 5000). The browser fires focus shortly after navigation, so every
   page load ran loadData() twice. Fixed by initializing lastRunRef to
   Date.now() - the throttle window now covers the mount itself.

2. 5-second throttle is too aggressive. An alt-tab to copy a value
   would trigger a full re-fetch on return. Bumped default to 30000.
   Callers can still override.

3. No way to skip refresh on hidden tabs. Added skipIfHidden option;
   when true, refresh is skipped if document.visibilityState != visible.
   Listeners still attach so becoming visible again still triggers.

5 heaviest pages opted into skipIfHidden: invoices, customers, products,
sales-orders, bills. Other ~80 pages keep default behavior - they still
benefit from the mount-fix and throttle bump silently.

Hook rewritten via bash heredoc - Write tool truncated mid-line on the
first attempt. customers/page.tsx end accidentally truncated during
heavy-page patching; restored via heredoc.

TypeScript: 0 errors." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.81 pushed" -ForegroundColor Green
    if (Test-Path 'push_v3.74.80.ps1') { Remove-Item -LiteralPath 'push_v3.74.80.ps1' -Force }
}
