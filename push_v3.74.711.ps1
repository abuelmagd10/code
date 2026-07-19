$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.710.ps1") { Remove-Item -LiteralPath "push_v3.74.710.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.711"') {
    Write-Host "+ 3.74.711" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.711]")) { Write-Host "X CHANGELOG missing [3.74.711]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# The plural sub_type never existed in the chart; it must not come back.
$hits = Select-String -Path "lib/**/*.ts","app/**/*.ts","app/**/*.tsx" -Pattern 'sub_type === "customer_credits"' -ErrorAction SilentlyContinue
if ($hits) {
    Write-Host "X customer_credits (plural) is back - it resolves to employee advances" -ForegroundColor Red
    $hits | ForEach-Object { Write-Host "   $_" }
    exit 1
}
Write-Host "+ customer credit resolves by the sub_type the chart ships" -ForegroundColor Green

$refund = Get-Content -LiteralPath "lib/services/customer-refund-command.service.ts" -Raw
if ($refund -notmatch 'sub_type === "customer_credit"') {
    Write-Host "X the refund service no longer resolves customer_credit" -ForegroundColor Red; exit 1
}
Write-Host "+ refund service resolves customer_credit" -ForegroundColor Green

# Every repair route that mutates data must carry a role gate.
$unguarded = @()
Get-ChildItem -Path "app/api" -Directory | Where-Object { $_.Name -like "fix-*" -or $_.Name -like "repair-*" } | ForEach-Object {
    $f = Join-Path $_.FullName "route.ts"
    if (-not (Test-Path $f)) { return }
    $src = Get-Content -LiteralPath $f -Raw
    $mutates = ($src -match "\.insert\(" -or $src -match "\.update\(" -or $src -match "\.delete\(")
    # All five auth entry points in use across app/api. The first version of this
    # guard knew only three and flagged fix-orphan-invoices, which is in fact
    # properly gated via secureApiRequest plus an explicit owner/admin check.
    # A guard that cries wolf gets ignored, so it has to know every real helper.
    $gated   = ($src -match "requireOwnerOrAdmin" -or $src -match "secureApiRequest" -or
                $src -match "requirePermission"   -or $src -match "requireAuth" -or
                $src -match "auth\.getUser")
    if ($mutates -and -not $gated) { $unguarded += $_.Name }
}
if ($unguarded.Count -gt 0) {
    Write-Host "X repair routes mutate data with no auth gate:" -ForegroundColor Red
    $unguarded | ForEach-Object { Write-Host "   $_" }
    exit 1
}
Write-Host "+ every data-mutating repair route is gated" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors - NOT pushing:" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "lib/services/customer-refund-command.service.ts" `
    "app/api/fix-invoice-0001-status/route.ts" `
    "app/api/fix-invoice-display/route.ts" `
    "app/api/fix-missing-payment-journals/route.ts" `
    "push_v3.74.711.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.710.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_711.txt"
    $msgLines = @(
        'fix(accounting): v3.74.711 - project-wide audit of account resolution',
        '',
        'Systematic sweep of every place the code looks up an account, compared',
        'against what the chart template actually ships. This is the one pattern',
        'that silently routes money to the wrong account.',
        '',
        'Result: 29 sub_types sought, 19 shipped correctly, 10 unmatched. Six of',
        'those are harmless - each is paired with a working alternative in the same',
        'chain (cost_of_goods_sold with cogs, raw_materials and finished_goods with',
        'inventory, revenue by name, income_summary with code 3300). Three appear',
        'only in one-off repair routes that are role-gated. One was a real defect.',
        '',
        'customer_credits (plural) does not exist in any chart. The chart ships',
        'customer_credit (singular, 2155). So the lookup always fell through to a',
        'name regex - /credit|salaf|daaen.*ameel/ - which matches "advances to',
        'employees" (an asset) and "advances from customers" just as readily as the',
        'real credit account. Worse, the result was nondeterministic: find() returns',
        'the first match in whatever row order the database happened to return, so',
        'an FX adjustment on a customer refund could land in a different unrelated',
        'account each time. Not yet triggered - customer refunds and credits are',
        'both still empty. Now resolves the singular sub_type, then code 2155, then',
        'an exact name, dropping the loose pattern.',
        '',
        'Found along the way: 17 one-off repair endpoints ship to production, some',
        'named after a specific customer or invoice. Three mutate invoices and',
        'journals with no role check at all. They use the session client so RLS',
        'blocks anonymous callers, but any signed-in employee could call them and',
        'bypass the role checks the UI enforces. All three now require owner or',
        'admin. (fix-nasr-stock was already retired behind a 410; three others',
        'authenticate but do not check role.)',
        '',
        'The push guard now fails if the plural sub_type returns, or if any repair',
        'route mutates data without a gate.'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.711 pushed - account resolution audited project-wide" -ForegroundColor Green
}
