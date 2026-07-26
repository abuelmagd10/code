$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.842.ps1") { Remove-Item -LiteralPath "push_v3.74.842.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.843"') {
    Write-Host "+ 3.74.843" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.843]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.843]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

$page = "app/hr/production-labour/page.tsx"
$side = "components/sidebar.tsx"
$wc   = "app/manufacturing/work-centers/page.tsx"
$api1 = "app/api/manufacturing/work-centers/route.ts"
$api2 = "app/api/manufacturing/work-centers/[id]/route.ts"
$mig  = "supabase/migrations/20260726000010_v3_74_843_casual_worker_upsert.sql"

# the casual-worker function comes from the live database, never hand-copied
Write-Host "Appending plw_upsert_casual_worker from the database..." -ForegroundColor Cyan
node scripts/append-function-to-migration.js $mig plw_upsert_casual_worker
if ($LASTEXITCODE -ne 0) { Write-Host "X could not append plw_upsert_casual_worker" -ForegroundColor Red; exit 1 }
$mc = Get-Content -LiteralPath $mig -Raw
if ($mc -notmatch "CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.plw_upsert_casual_worker\s*\(") {
    Write-Host "X the migration does not DEFINE plw_upsert_casual_worker" -ForegroundColor Red; exit 1
}
Write-Host "+ the casual-worker function is captured from the database" -ForegroundColor Green

$p = Get-Content -LiteralPath $page -Raw
$s = Get-Content -LiteralPath $side -Raw
$w = Get-Content -LiteralPath $wc   -Raw

# ── bilingual from the first line, not bolted on later ──────────────────────
foreach ($k in @("title:", "subtitle:", "newPayment:", "workers:", "approve:", "pay:", "hoursOnlyNote:")) {
    $n = ([regex]::Matches($p, [regex]::Escape($k))).Count
    if ($n -lt 2) {
        Write-Host "X '$k' exists $n time(s) - it must be in BOTH ar and en" -ForegroundColor Red; exit 1
    }
}
if ($p -notmatch [regex]::Escape('dir={lang === "en" ? "ltr" : "rtl"}')) {
    Write-Host "X the page direction does not follow the language" -ForegroundColor Red; exit 1
}
Write-Host "+ the screen is ar/en throughout, direction included" -ForegroundColor Green

# ── the screen must not be hidden from the two roles it exists for ──────────
if ($s -notmatch [regex]::Escape("allowHr || allowProductionLabour")) {
    Write-Host "X the HR group is still gated by a fixed role list - the accountant and" -ForegroundColor Red
    Write-Host "  manufacturing officer would never see the screen built for them." -ForegroundColor Red
    exit 1
}
if ($s -notmatch [regex]::Escape("if (href.includes('/hr/production-labour')) return 'production_labour_wages'")) {
    Write-Host "X the sidebar does not map the page to its own permission key" -ForegroundColor Red; exit 1
}
# and that mapping must be tested BEFORE /hr/payroll, or the prefix swallows it
$posPL  = $s.IndexOf("'/hr/production-labour'")
$posPay = $s.IndexOf("'/hr/payroll'")
if ($posPL -lt 0 -or $posPay -lt 0 -or $posPL -gt $posPay) {
    Write-Host "X the production-labour mapping must be checked before /hr/payroll" -ForegroundColor Red; exit 1
}
Write-Host "+ visible to the accountant and manufacturing officer, mapped to its own key" -ForegroundColor Green

# ── but they must NOT thereby gain payroll ──────────────────────────────────
if ($s -match "allowProductionLabour[^\n]*payroll") {
    Write-Host "X production-labour access was wired to the payroll resource" -ForegroundColor Red; exit 1
}
Write-Host "+ no payroll access granted through this route" -ForegroundColor Green

# ── the guard from 841 now has a way to be satisfied ────────────────────────
if ($w -notmatch [regex]::Escape("cost_center_id: wc.cost_center_id")) {
    Write-Host "X the work-centre form does not load the cost centre when editing" -ForegroundColor Red; exit 1
}
if ($w -notmatch "Label>\{t\(`"Cost center`"") {
    Write-Host "X the work-centre form has no cost-centre field - the 841 guard stays unsatisfiable" -ForegroundColor Red; exit 1
}
foreach ($f in @($api1, $api2)) {
    $c = Get-Content -LiteralPath $f -Raw
    if ($c -notmatch [regex]::Escape("cost_center_id: cost_center_id || null")) {
        Write-Host "X $f does not persist cost_center_id" -ForegroundColor Red; exit 1
    }
    if ($c -notmatch [regex]::Escape("cost_rate_uom, cost_rates_effective_from, cost_center_id")) {
        Write-Host "X $f does not return cost_center_id - the form would always look empty" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ cost centre: field on the form, persisted and returned by both routes" -ForegroundColor Green

# ── the screen must call the atomic functions, never write tables directly ──
foreach ($fn in @("plw_create_labour_payment","plw_submit_labour_payment","plw_approve_labour_payment","plw_reject_labour_payment","plw_pay_labour_payment","plw_upsert_casual_worker")) {
    if ($p -notmatch [regex]::Escape($fn)) {
        Write-Host "X the screen never calls $fn" -ForegroundColor Red; exit 1
    }
}
if ($p -match '\.from\("production_labour_payments"\)[\s\S]{0,80}\.(insert|update|delete)\(') {
    Write-Host "X the screen writes to the table directly - approval could be bypassed" -ForegroundColor Red; exit 1
}
Write-Host "+ every change goes through an atomic function" -ForegroundColor Green

Write-Host "Verifying migrations against the live database..." -ForegroundColor Cyan
node scripts/check-migration-matches-db.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X migration/database divergence" -ForegroundColor Red; exit 1 }

Write-Host "Verifying the audit trail cannot abort a business operation..." -ForegroundColor Cyan
node scripts/check-audit-cannot-abort.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X audit check failed" -ForegroundColor Red; exit 1 }

Write-Host "Smoke-testing the signup path against production..." -ForegroundColor Cyan
node scripts/verify-signup-path.js
if ($LASTEXITCODE -ne 0) { Write-Host "X signup is broken - NOT pushing" -ForegroundColor Red; exit 1 }

if (Test-Path "scripts/check-service-role-scoping.js") {
    Write-Host "Checking service-role scoping..." -ForegroundColor Cyan
    node scripts/check-service-role-scoping.js
    if ($LASTEXITCODE -ne 0) { Write-Host "X service-role scoping failed" -ForegroundColor Red; exit 1 }
}

Write-Host "Verifying the lockfile matches package.json..." -ForegroundColor Cyan
node scripts/check-lockfile-in-sync.js
if ($LASTEXITCODE -ne 0) { Write-Host "X lockfile check failed" -ForegroundColor Red; exit 1 }

Write-Host "Verifying referenced scripts and their inputs are committed..." -ForegroundColor Cyan
node scripts/check-referenced-scripts-tracked.js
if ($LASTEXITCODE -ne 0) { Write-Host "X referenced-scripts check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column writes..." -ForegroundColor Cyan
node scripts/check-phantom-columns.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-column check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out2 = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out2 -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }

Write-Host "Running tsc..." -ForegroundColor Cyan
if (Test-Path ".next/types") { Remove-Item ".next/types" -Recurse -Force -ErrorAction SilentlyContinue }
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

$files = @("lib/version.ts", "CHANGELOG.md", $page, $side, $wc, $api1, $api2, $mig,
           "docs/HANDOVER_2026-07-24.md", "push_v3.74.843.ps1")
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.842.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_843.txt"
    $msgLines = @(
        'feat(hr): v3.74.843 - production labour wages screen, and the cost-centre',
        'field the 841 guard needed',
        '',
        'The interface over the foundation built in 841 - bilingual from the first',
        "line rather than retrofitted, after today's lesson on the verification",
        'screen.',
        '',
        '/hr/production-labour sits under Employees & Payroll as the owner asked:',
        'a casual-worker register, a payment form (order, period, labour type,',
        'treasury, a line per worker), and a table showing total, estimate and the',
        'variance between them. Buttons appear by role - submit for the',
        'manufacturing officer, approve and reject for the owner or general',
        'manager, pay for the branch accountant.',
        '',
        'The buttons are a convenience, not the control. Separation of duties lives',
        'in the database functions: calling one directly from the wrong role is',
        'refused, and writes to the tables are revoked from the browser entirely.',
        '',
        'AN OBSTACLE THAT WOULD HAVE HIDDEN THE SCREEN FROM THE PEOPLE IT IS FOR.',
        'The Employees & Payroll sidebar group was gated by a fixed role list -',
        'owner, admin, manager - so the branch accountant and the manufacturing',
        'officer would never have seen it at all, and they are precisely who needs',
        'it. The group now opens for anyone holding production_labour_wages, and',
        'the per-item filter still hides Payroll and Employees from them. The group',
        'shows; the salaries do not.',
        '',
        "AND THE FIELD 841's GUARD REQUIRED. That release refused to activate a work",
        'centre without a cost centre - while the screen and the API had no such',
        'field at all. A prohibition with no path to compliance. It is now on the',
        'form and persisted by both routes, and the branch cost centre is suggested',
        'automatically so the user is not asked to make a choice that has only one',
        'answer.',
        '',
        'Recorded rule: every prohibition needs a path to compliance - and the',
        'screen is checked before the road is closed, not after.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.843 pushed - the screen is reachable by the people it was built for" -ForegroundColor Green
}
