$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.776.ps1") { Remove-Item -LiteralPath "push_v3.74.776.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.777"') {
    Write-Host "+ 3.74.777" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

# Mirror the pre-push hook exactly: it greps for "[<version>]" and nothing else.
# Learned in v3.74.776, where "[3.74.775 + 3.74.776]" passed my check and failed
# the hook's after the commit was already made.
$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.777]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.777]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# --- the shared helper --------------------------------------------------------
$helper = "lib/financial-trace.ts"
if (-not (Test-Path $helper)) { Write-Host "X missing $helper" -ForegroundColor Red; exit 1 }
$h = Get-Content -LiteralPath $helper -Raw

# Rule 1 is the one that must never regress: tracing cannot fail the operation.
if ($h -match "throw new Error" -or $h -match "throw err") {
    Write-Host "X the trace helper throws - an audit failure must never fail a financial operation" -ForegroundColor Red
    exit 1
}
if ($h -notmatch "return \{ traceId: null") {
    Write-Host "X the helper must return on trace failure, not propagate it" -ForegroundColor Red; exit 1
}
# Rule 3: links come from what the operation returned.
if ($h -notmatch "if \(!link\.entityId\) continue") {
    Write-Host "X the helper must skip links whose entity was not produced" -ForegroundColor Red; exit 1
}
Write-Host "+ helper never throws, and only links what actually exists" -ForegroundColor Green

# --- both routes wired ---------------------------------------------------------
$routes = @(
    "app/api/customer-refund-requests/[id]/execute/route.ts",
    "app/api/vendor-payment-correction-requests/[id]/execute/route.ts"
)
foreach ($r in $routes) {
    # -LiteralPath, because these paths contain [id] and PowerShell reads square
    # brackets as a wildcard character class. Without it Test-Path reports the
    # file missing while git, npx and node all find it perfectly well — a guard
    # failing on a file that exists, for reasons that have nothing to do with
    # the file.
    if (-not (Test-Path -LiteralPath $r)) { Write-Host "X missing route: $r" -ForegroundColor Red; exit 1 }
    $src = Get-Content -LiteralPath $r -Raw
    if ($src -notmatch 'from "@/lib/financial-trace"') {
        Write-Host "X $r does not import the shared helper" -ForegroundColor Red; exit 1
    }
    if ($src -notmatch "recordFinancialTrace\(supabase") {
        Write-Host "X $r imports the helper but never calls it" -ForegroundColor Red; exit 1
    }
    # The trace must run AFTER the RPC succeeded, or it records an operation
    # that did not happen.
    #
    # Compare the CALL SITES, not the names. The first version searched for the
    # bare string "recordFinancialTrace", which matched the import on line 6 —
    # before the RPC by definition — and rejected correct code. That is the same
    # mistake as matching a table name inside a comment, or a function name in
    # prose: the identifier appears in more places than the thing it does.
    $rpcIdx   = $src.IndexOf('.rpc("execute_')
    $traceIdx = $src.IndexOf("recordFinancialTrace(supabase")
    if ($traceIdx -lt 0) {
        Write-Host "X $r never calls the helper" -ForegroundColor Red; exit 1
    }
    if ($rpcIdx -ge 0 -and $traceIdx -lt $rpcIdx) {
        Write-Host "X $r traces before the RPC runs - it would record work not done" -ForegroundColor Red
        exit 1
    }
    # Journal entries are the point of an audit trail here.
    if ($src -notmatch "reversal_journal_entry_id") {
        Write-Host "X $r does not link the reversal journal entry" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ both correction routes trace after the RPC, linking payments and journals" -ForegroundColor Green

# --- the 15 existing copies must be left alone --------------------------------
# Consolidating them means choosing one behaviour for every financial service at
# once. That is a separate piece of work; this release must not start it by
# accident.
$copies = (Get-ChildItem -Path "lib/services" -Filter *.ts -Recurse |
           Select-String -Pattern "async linkTrace" -List).Count
if ($copies -ne 15) {
    Write-Host "X expected the 15 existing linkTrace copies untouched, found $copies" -ForegroundColor Red
    exit 1
}
Write-Host "+ the 15 existing copies untouched - consolidation is its own job" -ForegroundColor Green

git checkout -- "supabase/schema/functions.sql" "supabase/schema/schema.sql" 2>&1 | Out-Null

Write-Host "Running the snapshot freshness check..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X snapshot check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the unchecked-writes check..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X baseline mismatch" -ForegroundColor Red; exit 1 }

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

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

git add -- "lib/version.ts" "CHANGELOG.md" "lib/financial-trace.ts" `
    "app/api/customer-refund-requests/[id]/execute/route.ts" `
    "app/api/vendor-payment-correction-requests/[id]/execute/route.ts" `
    "push_v3.74.777.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.776.ps1" 2>$null

git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_777.txt"
    $msgLines = @(
        'feat(audit): v3.74.777 - payment corrections traced; family complete 5/5',
        '',
        'A payment correction voids a payment and posts a replacement: two journal',
        'entries and two payment rows from a single decision, and none of it',
        'recorded who decided. Both the customer and vendor routes now tie the whole',
        'operation to one trace - request, original payment, reversal payment,',
        'replacement payment, reversal journal entry, new journal entry.',
        '',
        'The trace sits at the CALLER here, which is the opposite of the choice made',
        'for booking custody in v3.74.774. Different circumstances, not',
        'inconsistency:',
        '',
        '  custody had several callers, one of them automatic, so the posting',
        '  function was the only place that covered them all;',
        '',
        '  these RPCs have ZERO database callers and exactly one route each, both',
        '  verified against pg_proc, and they are 14 KB and 12 KB functions that',
        '  write journal entries directly. Rewriting 26 KB of financial code to',
        '  insert four lines is precisely the transcription risk that',
        '  append-function-to-migration.js was written to avoid yesterday.',
        '',
        'Both RPCs return every id they create, so the links describe what actually',
        'happened rather than what was requested - a correction that produced no',
        'reversal entry does not get a link claiming otherwise.',
        '',
        'lib/financial-trace.ts is new. createTrace/linkTrace are privately',
        're-implemented in FIFTEEN command services and have already drifted:',
        'customer-payment orders its lookup by created_at, purchase-return does not,',
        'so they return different rows when a trace has several links of one type.',
        'When two more call sites needed tracing, the shared helper was written',
        'instead of making it seventeen. The existing fifteen are untouched, and the',
        'push script asserts that - consolidating them means choosing one behaviour',
        'for every financial service at once and deserves its own session.',
        '',
        'Three rules are written into the helper and checked on push: tracing never',
        'throws, so an audit failure cannot fail a financial operation; the actor is',
        'recorded honestly including as null; and links come from what the operation',
        'returned, not from what it was asked to do.',
        '',
        'The family is complete: custody out, custody return, service consumption',
        'COGS, customer payment correction, vendor payment correction.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.777 pushed - trace family complete 5/5" -ForegroundColor Green
}
