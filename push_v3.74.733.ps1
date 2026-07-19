$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.732.ps1") { Remove-Item -LiteralPath "push_v3.74.732.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.733"') {
    Write-Host "+ 3.74.733" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.733]")) { Write-Host "X CHANGELOG missing [3.74.733]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

# The write paths must be closed and must contain no Supabase client at all.
# A 410 that still constructs a service-role client is one edit away from being
# live again.
$neg  = Get-Content -LiteralPath "app/api/fix-negative-payments/route.ts" -Raw
$bill = Get-Content -LiteralPath "app/api/fix-bill-return/route.ts" -Raw

foreach ($pair in @(@($neg, "fix-negative-payments"), @($bill, "fix-bill-return"))) {
    $body = $pair[0]; $name = $pair[1]
    if ($body -notmatch "status: 410") {
        Write-Host "X $name POST no longer returns 410" -ForegroundColor Red; exit 1
    }
    if ($body -match "SUPABASE_SERVICE_ROLE_KEY") {
        Write-Host "X $name still builds a service-role client - the write path is one edit from live" -ForegroundColor Red; exit 1
    }
    if ($body -match "\.delete\(\)") {
        Write-Host "X $name still deletes rows" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ both write paths retired, no service-role client left" -ForegroundColor Green

# The read-only twin is what makes retiring the fixer acceptable. It must stay,
# and it must stay company-scoped - the missing filter is the entire reason the
# fixer was dangerous.
$insp = Get-Content -LiteralPath "app/api/inspect-negative-payments/route.ts" -Raw
if ($insp -notmatch '\.eq\("company_id", companyId\)') {
    Write-Host "X the inspector lost its company filter - the exact defect that made the fixer dangerous" -ForegroundColor Red; exit 1
}
if ($insp -match "\.delete\(\)" -or $insp -match "\.insert\(") {
    Write-Host "X the inspector is no longer read-only" -ForegroundColor Red; exit 1
}
Write-Host "+ inspector still read-only and company-scoped" -ForegroundColor Green

# Pages must not call the retired endpoints.
$pNeg  = Get-Content -LiteralPath "app/admin/fix-negative-payments/page.tsx" -Raw
$pBill = Get-Content -LiteralPath "app/admin/fix-bill-return/page.tsx" -Raw
if ($pNeg -match 'fetch\("/api/fix-negative-payments"' -or $pNeg -match "fetch\('/api/fix-negative-payments'") {
    Write-Host "X the page still calls the retired fixer" -ForegroundColor Red; exit 1
}
# Match the CALL, not the path. The page's own comment names the endpoint to
# explain why it was retired, and a bare path match trips on that explanation.
# This is the third time I have written a guard that rejects its own
# documentation (v3.74.726, v3.74.727) - the rule is: guards match code shapes,
# never names.
if ($pBill -match 'fetch\(\s*["'']/api/fix-bill-return') {
    Write-Host "X the bill-return page still calls the retired endpoint" -ForegroundColor Red; exit 1
}
if ($pNeg -notmatch "/api/inspect-negative-payments") {
    Write-Host "X the page lost the read-only inspection it is meant to keep" -ForegroundColor Red; exit 1
}
Write-Host "+ pages inspect only" -ForegroundColor Green

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

git add -- `
    "lib/version.ts" `
    "CHANGELOG.md" `
    "app/api/fix-negative-payments/route.ts" `
    "app/api/fix-bill-return/route.ts" `
    "app/admin/fix-negative-payments/page.tsx" `
    "app/admin/fix-bill-return/page.tsx" `
    "push_v3.74.733.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.732.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_733.txt"
    $msgLines = @(
        'security: v3.74.733 - retire two destructive repair tools',
        '',
        'First, the correction. I searched for these three endpoints, did not find',
        'them, concluded the admin pages were dead UI, and wrote a release deleting',
        'them. The search was wrong: I grepped file CONTENTS for the directory name,',
        'which of course does not appear inside route.ts. All three exist.',
        '',
        'The push guard stopped it. I had written that guard to re-check the PREMISE',
        '- "these endpoints do not exist" - rather than enforce the outcome, and it',
        'refused to push. A guard that only checked what I had done would have',
        'deleted two pages happily.',
        '',
        'The reality is worse than my original guess.',
        '',
        'fix-negative-payments discarded companyId from requireOwnerOrAdmin and then',
        'ran select("*").lt("amount", 0) with no company filter, taking company_id',
        'from each payment ROW rather than the session, creating sales returns and',
        'deleting payments through the service role. One owner of one company',
        'pressing that button rewrote payment history for every tenant. The',
        'permission check confirmed they were an owner somewhere; it never',
        'constrained what they touched. Its read-only twin,',
        'inspect-negative-payments, keeps companyId and filters on it - same',
        'feature, one line apart, and the safe one is the one that only reads.',
        '',
        'fix-bill-return hard-deleted journal entry lines, then the entries, then the',
        'inventory movements, zeroed returned_quantity, and forced the bill to',
        '"paid" - with the author''s own comment next to it saying "or whatever',
        'status is appropriate". Accounting corrections are made by posting a',
        'reversing entry, not by deleting the original. After a run there was no',
        'evidence the return happened, and none that it was removed. It also left',
        'fifo_lot_consumptions pointing at movements that no longer existed.',
        '',
        'Both POSTs now return 410 and the files contain no Supabase client at all -',
        'a 410 that still builds a service-role client is one edit from live. The',
        'company-scoped read-only inspector stays. The pages explain themselves',
        'instead of vanishing; whoever bookmarked them deserves a reason, not a 404.',
        '',
        'Not repaired, closed. A correct version posts reversing entries, calls the',
        'FIFO restore path, and derives status from actual payments - it would not',
        'be these files with a patch.',
        '',
        'One more of my own errors, caught on the first run: the page guard matched',
        'the endpoint PATH, so it tripped on the comment explaining why the endpoint',
        'was retired. Third time today (v3.74.726, v3.74.727, here). The rule is now',
        'written into the script: guards match code shapes, never names, or they',
        'reject their own documentation.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.733 pushed - destructive repair tools retired" -ForegroundColor Green
}
