$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.725.ps1") { Remove-Item -LiteralPath "push_v3.74.725.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.726"') {
    Write-Host "+ 3.74.726" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.726]")) { Write-Host "X CHANGELOG missing [3.74.726]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$mig = "supabase/migrations/20260719000726_v3_74_726_drop_fix_historical_cogs.sql"
if (-not (Test-Path $mig)) { Write-Host "X migration file missing" -ForegroundColor Red; exit 1 }
if ((Get-Content -LiteralPath $mig -Raw) -notmatch "DROP FUNCTION IF EXISTS public\.fix_historical_cogs") {
    Write-Host "X the migration does not drop fix_historical_cogs" -ForegroundColor Red; exit 1
}
Write-Host "+ migration drops the function" -ForegroundColor Green

# The write path must stay closed. A 410 with no Supabase write is the whole
# point of the release - if POST ever calls the RPC again it is back.
$api = Get-Content -LiteralPath "app/api/fix-cogs-accounting/route.ts" -Raw
# Match the CALL, not the name - the file's comments explain why the function
# was dropped, and a bare name match would trip on that explanation.
if ($api -match "rpc\(\s*'fix_historical_cogs'" -or $api -match 'rpc\(\s*"fix_historical_cogs"') {
    Write-Host "X the API still calls fix_historical_cogs - the dropped function is back in play" -ForegroundColor Red; exit 1
}
if ($api -notmatch "status: 410") {
    Write-Host "X POST no longer returns 410 - the repair button may be live again" -ForegroundColor Red; exit 1
}
if ($api -match "exec_sql") {
    Write-Host "X exec_sql is back - it does not exist and its failure was reported as success" -ForegroundColor Red; exit 1
}
Write-Host "+ write path retired (410, no RPC)" -ForegroundColor Green

# The old diagnostic hid any product whose card read 0 but whose FIFO lots held
# a real cost. Do not let that filter return. Match the CODE, not the word -
# the file's own comments explain why cost_price was removed, and a bare word
# match would trip on the explanation.
if ($api -match "products\(cost_price" -or $api -match "products\?\.cost_price") {
    Write-Host "X the cost_price filter is back - it hides the movements worth seeing" -ForegroundColor Red; exit 1
}
Write-Host "+ diagnostic no longer filtered by cost_price" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/settings/fix-cogs/page.tsx" -Raw
if ($page -match 'method:\s*"POST"') {
    Write-Host "X the page still POSTs - the repair button is live" -ForegroundColor Red; exit 1
}
Write-Host "+ page is read-only" -ForegroundColor Green

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
    "$mig" `
    "app/api/fix-cogs-accounting/route.ts" `
    "app/settings/fix-cogs/page.tsx" `
    "push_v3.74.726.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.725.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_726.txt"
    $msgLines = @(
        'fix(accounting): v3.74.726 - retire a repair tool that corrupted the ledger',
        '',
        'Asked to rank the backlog, I checked instead of ranking from memory, and',
        'the list was wrong. The item I would have put first - sale returns not',
        'FIFO-aligned - has been fixed since v3.74.702; both the forward and',
        'reverse COGS paths call the FIFO functions, with cost_price only as a',
        'legacy fallback. Trusting my own list would have cost a day on a problem',
        'that did not exist.',
        '',
        'What was actually there: fix_historical_cogs, reachable from',
        '/settings/fix-cogs, with three defects.',
        '',
        'It was SECURITY DEFINER with EXECUTE to PUBLIC and took p_company_id from',
        'the caller with no membership check - so any authenticated user of any',
        'company could pass another company''s UUID straight to PostgREST and',
        'inject journal entries into that company''s ledger. The permission check',
        'in the API was protecting nothing; the function sat exposed behind it.',
        '',
        'It valued COGS at products.cost_price, the snapshot abandoned in',
        'v3.74.702 for inflating profit. And it posted without consuming FIFO',
        'lots, leaving batches showing stock the ledger had already expensed.',
        '',
        'The API also called exec_sql, which does not exist. That step failed',
        'every time, was recorded in errors, and the response still said the',
        'accounting corrections had been applied successfully. A repair tool that',
        'corrupts what it repairs, and reassures you while doing it.',
        '',
        'Dropped rather than revoked, so no landmine remains to be re-granted.',
        'POST returns 410; the page is now a read-only check. Also removed the',
        'cost_price > 0 filter from that check - it hid exactly the movements',
        'worth seeing, reporting a product with a zero card and real lot costs as',
        'healthy.',
        '',
        'Not closed, and not claimed as closed: a first sweep finds 117 functions',
        'matching the same shape - SECURITY DEFINER, EXECUTE to PUBLIC, a',
        'company_id argument, writes, no membership check. That is a candidate',
        'count from a crude heuristic, not a vulnerability count; many are trigger',
        'helpers never called directly. It needs a deliberate triage pass. Next.'
    )
    # v3.74.726 - .NET WriteAllLines writes UTF-8 with no BOM on both Windows
    # PowerShell and PS7. Set-Content -Encoding UTF8 prepended a BOM, which
    # showed up as stray bytes at the head of the v3.74.725 commit subject.
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.726 pushed - fix_historical_cogs retired" -ForegroundColor Green
}
