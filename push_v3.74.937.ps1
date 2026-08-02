$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.937 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.936.ps1") { Remove-Item -LiteralPath "push_v3.74.936.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.937"') {
    Write-Host "+ 3.74.937" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.937]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.937]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
# No migration: stage 2, second batch - the bill screen itself.
$detail = "app/bills/[id]/page.tsx"
$guard  = "scripts/check-purchase-money-direct-read.js"
$trap   = "scripts/selftest-purchase-money-direct-read.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $detail, $guard, $trap,
           "scripts/check-purchase-cost-masked-path.js",
           "scripts/check-product-management-one-door.js",
           "push_v3.74.937.ps1")

$d = Get-Content -LiteralPath $detail -Raw
$g = Get-Content -LiteralPath $guard -Raw
$t = Get-Content -LiteralPath $trap -Raw

# -- 1. the screen asks the rule, for THIS bill's branch ----------------
if ($d -notmatch [regex]::Escape("fetchCanViewPurchaseCost")) {
    Write-Host "X the bill screen never asks whether the reader may see the cost" -ForegroundColor Red; exit 1
}
if ($d -notmatch [regex]::Escape("branch_id ?? null")) {
    Write-Host "X it asks without the bill's branch - 914 would be undone" -ForegroundColor Red; exit 1
}
Write-Host "+ the bill screen asks the rule, scoped to that bill's branch" -ForegroundColor Green

# -- 2. what builds a document from a price is gated --------------------
if ($d -notmatch [regex]::Escape("if (!canSeeCost)")) {
    Write-Host "X the return dialog is not gated - it would build a return out of zeros" -ForegroundColor Red
    exit 1
}
Write-Host "+ the return dialog refuses before it reads a price it may not see" -ForegroundColor Green

# -- 3. and the linked purchase order is never overwritten with a blank -
# This screen copies the bill totals INTO the purchase order. Writing a
# hidden amount there would corrupt a document nobody has open. Skipping
# in silence is no better: the order keeps stale figures and nobody knows.
if ($d -notmatch [regex]::Escape("billData.subtotal == null")) {
    Write-Host "X the purchase-order sync does not check for a hidden amount" -ForegroundColor Red; exit 1
}
if ($d -notmatch [regex]::Escape("throw new Error")) {
    Write-Host "X the sync skips in silence instead of refusing out loud" -ForegroundColor Red; exit 1
}
Write-Host "+ the purchase-order sync refuses out loud rather than writing a blank" -ForegroundColor Green

# -- 4. no lying zero on this screen either -----------------------------
if ($d -match [regex]::Escape("{currencySymbol}{bill.total_amount.toLocaleString")) {
    Write-Host "X the total card would print a figure for a hidden amount" -ForegroundColor Red; exit 1
}
if ($d -notmatch [regex]::Escape("HIDDEN_MONEY")) {
    Write-Host "X the screen has no symbol for a hidden amount" -ForegroundColor Red; exit 1
}
Write-Host "+ hidden amounts read as a dash, not as a number" -ForegroundColor Green

# -- 5. a dropped connection is not a measurement ------------------------
# Three runs died today on a transient drop, and one of them KILLED the
# process with a raw stack instead of reporting - a guard that falls over at
# random gets worked around within a week.
foreach ($dbGuard in @("scripts/check-purchase-cost-masked-path.js",
                       "scripts/check-product-management-one-door.js")) {
    $gsrc = Get-Content -LiteralPath $dbGuard -Raw
    if ($gsrc -notmatch [regex]::Escape("client.on(")) {
        Write-Host "X $dbGuard has no error listener - a dropped socket would kill it" -ForegroundColor Red
        exit 1
    }
    if ($gsrc -notmatch [regex]::Escape("TRANSIENT")) {
        Write-Host "X $dbGuard does not retry a transient drop" -ForegroundColor Red; exit 1
    }
    if ($gsrc -notmatch [regex]::Escape("problems.length = 0")) {
        Write-Host "X $dbGuard would carry half a measurement into its retry" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ the database guards survive a dropped connection, and retry from a clean slate" -ForegroundColor Green

# -- 5. and the ratchet grew ---------------------------------------------
if ($g -notmatch [regex]::Escape('"app/bills/[id]/page.tsx"')) {
    Write-Host "X the converted screen was not added to the guard - it would not be watched" -ForegroundColor Red
    exit 1
}
if ($t -notmatch [regex]::Escape("a comment that merely mentions the table")) {
    Write-Host "X the trap no longer pins the comment false-positive" -ForegroundColor Red; exit 1
}
Write-Host "+ the converted screen joined the ratchet in the same release" -ForegroundColor Green

# -- 6. the battery below still proves the standing guards ----------------
$self2 = Get-Content -LiteralPath "push_v3.74.937.ps1" -Raw
if ($self2 -notmatch [regex]::Escape("check-je-default-status.js --prove --require-db")) {
    Write-Host "X the push battery no longer proves the je-default guard" -ForegroundColor Red; exit 1
}
if ($self2 -notmatch [regex]::Escape("check-anon-open-tables.js --prove --require-db")) {
    Write-Host "X the push battery no longer proves the anon-open guard" -ForegroundColor Red; exit 1
}
if ($self2 -notmatch [regex]::Escape("selftest-products-branch-policy.js")) {
    Write-Host "X the branch-rules guard is not proven refusing in this battery" -ForegroundColor Red; exit 1
}
if ($self2 -notmatch [regex]::Escape("selftest-branch-isolation-holes.js")) {
    Write-Host "X the branch-isolation guard is not proven refusing in this battery" -ForegroundColor Red; exit 1
}
if ($self2 -notmatch [regex]::Escape("selftest-transfer-journal.js")) {
    Write-Host "X the transfer-journal mechanism is not proven in this battery" -ForegroundColor Red; exit 1
}
if ($self2 -notmatch [regex]::Escape("selftest-purchase-cost-masked-path.js")) {
    Write-Host "X the masked-path guard is not proven refusing in this battery" -ForegroundColor Red; exit 1
}
if ($self2 -notmatch [regex]::Escape("selftest-cost-rule-has-one-home.js")) {
    Write-Host "X the one-home guard is not proven refusing in this battery" -ForegroundColor Red; exit 1
}
if ($self2 -notmatch [regex]::Escape("selftest-product-management-one-door.js")) {
    Write-Host "X the products-door guard is not proven refusing in this battery" -ForegroundColor Red; exit 1
}
if ($self2 -notmatch [regex]::Escape("selftest-purchase-money-direct-read.js")) {
    Write-Host "X the direct-read guard is not proven refusing in this battery" -ForegroundColor Red; exit 1
}
Write-Host "+ the battery plants its probes and watches every guard refuse, every release" -ForegroundColor Green

# ---------------------------------------------------------------------------
# The snapshot mirrors the database, and this release rewrites two functions.
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.936.ps1" 2>$null

# -- 7. nothing staged beyond this release (the 872 lesson) --------------
$expected = @($files) + @("push_v3.74.936.ps1")
$stagedNow = git diff --cached --name-only
foreach ($p in $stagedNow) {
    if ($expected -notcontains $p) {
        Write-Host "X staged but not part of this release: $p" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ nothing is staged beyond this release's file list" -ForegroundColor Green

Write-Host "Proving the direct-read guard refuses, and spares comments and writes..." -ForegroundColor Cyan
node scripts/selftest-purchase-money-direct-read.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the direct-read guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking converted screens read purchase money through the masked path only..." -ForegroundColor Cyan
node scripts/check-purchase-money-direct-read.js --list
if ($LASTEXITCODE -ne 0) { Write-Host "X a converted screen reads a table directly" -ForegroundColor Red; exit 1 }

Write-Host "Proving the products-door guard refuses all three shapes (TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-product-management-one-door.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the products-door guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Measuring who may create a product, by actually trying it as every member..." -ForegroundColor Cyan
node scripts/check-product-management-one-door.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X who may create a product is not what the code assumes" -ForegroundColor Red; exit 1 }

Write-Host "Proving the one-home guard refuses a second copy of the cost rule..." -ForegroundColor Cyan
node scripts/selftest-cost-rule-has-one-home.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the one-home guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking the cost rule has exactly one home..." -ForegroundColor Cyan
node scripts/check-cost-rule-has-one-home.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the cost rule has more than one home" -ForegroundColor Red; exit 1 }

Write-Host "Proving the masked path refuses all six shapes (TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-purchase-cost-masked-path.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the masked-path guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Measuring the purchase-cost masked path by impersonation on the live database..." -ForegroundColor Cyan
node scripts/check-purchase-cost-masked-path.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X the masked path is not what the code assumes" -ForegroundColor Red; exit 1 }

Write-Host "Proving an exposed SECURITY DEFINER writer is refused (TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-exposed-definer-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the definer-exposure guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Auditing SECURITY DEFINER writers on the live database..." -ForegroundColor Cyan
node scripts/check-exposed-definer-functions.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a full-rights writer is reachable by end users" -ForegroundColor Red; exit 1 }

Write-Host "Proving an unposted cross-branch transfer is refused (TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-transfer-journal.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the transfer-journal mechanism was not proven" -ForegroundColor Red; exit 1 }

Write-Host "Proving the branch-isolation guard catches the real leak - on TWELVE shapes (TEST only)..." -ForegroundColor Cyan
node scripts/selftest-branch-isolation-holes.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the branch-isolation guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Measuring branch isolation by impersonation on the live database..." -ForegroundColor Cyan
node scripts/check-branch-isolation-holes.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a branch member reads another branch's documents" -ForegroundColor Red; exit 1 }

Write-Host "Proving the branch-rules guard refuses all five reversions (TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-products-branch-policy.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the branch-visibility guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking product visibility by branch is in force on the live database..." -ForegroundColor Cyan
node scripts/check-products-branch-policy.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X the branch rule is not in force on the database" -ForegroundColor Red; exit 1 }

Write-Host "Proving the cost-grant guard refuses a re-grant (on the TEST database only)..." -ForegroundColor Cyan
node scripts/selftest-product-cost-grant.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the grant guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking the purchase cost is actually revoked on the live database..." -ForegroundColor Cyan
node scripts/check-product-cost-grant.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X the hide is not in force on the database" -ForegroundColor Red; exit 1 }

Write-Host "Proving the product-cost-read guard refuses (and keeps the debt visible)..." -ForegroundColor Cyan
node scripts/selftest-product-cost-direct-read.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the cost-read guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking product cost is read through the authorised path only..." -ForegroundColor Cyan
node scripts/check-product-cost-direct-read.js
if ($LASTEXITCODE -ne 0) { Write-Host "X a direct product-cost read is back" -ForegroundColor Red; exit 1 }

Write-Host "Proving the products-star guard refuses (and spares the innocent)..." -ForegroundColor Cyan
node scripts/selftest-products-select-star.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the products-star guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking no select(*) on products, and that the named list matches the table..." -ForegroundColor Cyan
node scripts/check-products-select-star.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a star survives on products, or the named list drifted from the table" -ForegroundColor Red; exit 1 }

Write-Host "Proving the silent-cancel guard refuses - and reproducing the defect..." -ForegroundColor Cyan
node scripts/selftest-trigger-silently-cancels-delete.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the silent-cancel guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking no BEFORE DELETE trigger cancels a delete in silence..." -ForegroundColor Cyan
node scripts/check-trigger-silently-cancels-delete.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a trigger can swallow a delete" -ForegroundColor Red; exit 1 }

Write-Host "Proving the impossible-rollback guard refuses (and stays silent)..." -ForegroundColor Cyan
node scripts/selftest-impossible-rollback.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the impossible-rollback guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Counting compensating deletes a trigger can refuse (must stay ZERO)..." -ForegroundColor Cyan
# NO `| Select-Object -First N` here (883 lesson: -First kills the pipe, node
# gets EPIPE, and a PASSING guard is declared a failure). -Last N drains.
node scripts/check-impossible-rollback.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a compensating delete a trigger can refuse still exists" -ForegroundColor Red; exit 1 }

Write-Host "Proving the sub_type divergence guard refuses..." -ForegroundColor Cyan
node scripts/selftest-subtype-tenant-divergence.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the divergence guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking no sub_type exists in some companies but not others..." -ForegroundColor Cyan
node scripts/check-subtype-tenant-divergence.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a sub_type the code searches for is present in only some companies" -ForegroundColor Red; exit 1 }

Write-Host "Proving the ledger-landmine guard refuses..." -ForegroundColor Cyan
node scripts/selftest-ledger-landmines.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the landmine guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking for ledger landmines..." -ForegroundColor Cyan
node scripts/check-ledger-landmines.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X a new ledger landmine appeared" -ForegroundColor Red; exit 1 }

Write-Host "Proving the snapshot/database guard refuses..." -ForegroundColor Cyan
node scripts/selftest-schema-snapshot-matches-db.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the snapshot guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking the snapshot matches the live database..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-matches-db.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X the snapshot disagrees with the database" -ForegroundColor Red; exit 1 }

Write-Host "Checking the snapshot does not resurrect a dropped function..." -ForegroundColor Cyan
node scripts/check-schema-snapshot-fresh.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the snapshot still describes something a migration removed" -ForegroundColor Red; exit 1 }

Write-Host "Proving the phantom-column guard refuses insert AND upsert..." -ForegroundColor Cyan
node scripts/selftest-phantom-columns.js
if ($LASTEXITCODE -ne 0) { Write-Host "X the phantom-column guard was not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column writes (update + insert + upsert)..." -ForegroundColor Cyan
node scripts/check-phantom-columns.js --require-db | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-column check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking hard-coded account codes..." -ForegroundColor Cyan
node scripts/check-hardcoded-account-codes.js
if ($LASTEXITCODE -ne 0) { Write-Host "X account-code check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking purchase movement cost matches the ledger..." -ForegroundColor Cyan
node scripts/check-movement-cost-matches-ledger.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a movement disagrees with the ledger" -ForegroundColor Red; exit 1 }

Write-Host "Checking custody movements are costed and linked..." -ForegroundColor Cyan
node scripts/check-custody-movements-costed-and-linked.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a custody movement is uncosted or unlinked" -ForegroundColor Red; exit 1 }

Write-Host "Checking ledger integrity..." -ForegroundColor Cyan
node scripts/check-ledger-integrity.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X ledger integrity is broken" -ForegroundColor Red; exit 1 }

Write-Host "Counting writes whose result is never checked..." -ForegroundColor Cyan
node scripts/check-unchecked-writes.js | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { Write-Host "X unchecked-writes baseline moved the wrong way" -ForegroundColor Red; exit 1 }

Write-Host "Proving the audit-trail guard refuses..." -ForegroundColor Cyan
node scripts/selftest-audit-trail-records.js
if ($LASTEXITCODE -ne 0) { Write-Host "X audit guard not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Checking every audited table actually records..." -ForegroundColor Cyan
node scripts/check-audit-trail-actually-records.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X an audited table records nothing" -ForegroundColor Red; exit 1 }

Write-Host "Checking no route writes the request body straight through..." -ForegroundColor Cyan
node scripts/check-request-body-written-raw.js
if ($LASTEXITCODE -ne 0) { Write-Host "X raw-body writes remain" -ForegroundColor Red; exit 1 }

Write-Host "Proving the raw-body guard refuses..." -ForegroundColor Cyan
node scripts/selftest-request-body-written-raw.js
if ($LASTEXITCODE -ne 0) { Write-Host "X raw-body guard not seen refusing" -ForegroundColor Red; exit 1 }

Write-Host "Proving the anon-open guard refuses BOTH shapes, then checking (v3.74.892)..." -ForegroundColor Cyan
node scripts/check-anon-open-tables.js --prove --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X tables are open to anon" -ForegroundColor Red; exit 1 }

Write-Host "Proving the je-default guard refuses a planted omitting function, then checking (v3.74.893)..." -ForegroundColor Cyan
node scripts/check-je-default-status.js --prove --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X a new function relies on the journal_entries.status default" -ForegroundColor Red; exit 1 }

Write-Host "Checking nobody is stranded without a company..." -ForegroundColor Cyan
node scripts/check-users-without-company.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X stranded-user check failed" -ForegroundColor Red; exit 1 }

Write-Host "Running the governance audit..." -ForegroundColor Cyan
node scripts/ai-governance-audit.js --ci
if ($LASTEXITCODE -ne 0) { Write-Host "X governance audit failed" -ForegroundColor Red; exit 1 }

Write-Host "Counting duplicate-audience notifications..." -ForegroundColor Cyan
node scripts/check-duplicate-role-notifications.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X duplicate-notification check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking finished-goods conversion cost..." -ForegroundColor Cyan
node scripts/check-finished-goods-conversion-cost.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X finished-goods costing check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking inventory movement coverage..." -ForegroundColor Cyan
node scripts/check-inventory-movement-coverage.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X movement-coverage check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking phantom column reads..." -ForegroundColor Cyan
node scripts/check-phantom-selects.js
if ($LASTEXITCODE -ne 0) { Write-Host "X phantom-select check failed" -ForegroundColor Red; exit 1 }

Write-Host "Checking no company-reading function is open to anonymous callers..." -ForegroundColor Cyan
node scripts/check-anon-reachable-functions.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X the security finding is not cleared" -ForegroundColor Red; exit 1 }

Write-Host "Verifying migrations against the live database..." -ForegroundColor Cyan
node scripts/check-migration-matches-db.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X migration/database divergence" -ForegroundColor Red; exit 1 }

Write-Host "Verifying the audit trail cannot abort a business operation..." -ForegroundColor Cyan
node scripts/check-audit-cannot-abort.js --require-db
if ($LASTEXITCODE -ne 0) { Write-Host "X audit check failed" -ForegroundColor Red; exit 1 }

Write-Host "Smoke-testing the signup path against production..." -ForegroundColor Cyan
node scripts/verify-signup-path.js
if ($LASTEXITCODE -ne 0) { Write-Host "X signup is broken - NOT pushing" -ForegroundColor Red; exit 1 }

Write-Host "Checking service-role scoping..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js
if ($LASTEXITCODE -ne 0) { Write-Host "X service-role scoping failed" -ForegroundColor Red; exit 1 }

Write-Host "Verifying the lockfile matches package.json..." -ForegroundColor Cyan
node scripts/check-lockfile-in-sync.js
if ($LASTEXITCODE -ne 0) { Write-Host "X lockfile check failed" -ForegroundColor Red; exit 1 }

Write-Host "Verifying referenced scripts and their inputs are committed..." -ForegroundColor Cyan
node scripts/check-referenced-scripts-tracked.js
if ($LASTEXITCODE -ne 0) { Write-Host "X referenced-scripts check failed" -ForegroundColor Red; exit 1 }

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

git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.936.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "zz-probe") { Write-Host "X a self-test probe got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "_to_delete") { Write-Host "X a scratch folder got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "_wip_") { Write-Host "X a scratch folder got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_937.txt"
    $msgLines = @(
        'feat(security): v3.74.937 - the bill screen reads its money through the masked path',
        '',
        'STAGE 2, SECOND BATCH: app/bills/[id]/page.tsx - the heaviest file of the',
        'family. Ten read sites moved to the masked views; writes stay on the',
        'tables.',
        '',
        'TWO ACTIONS ON THIS SCREEN BUILD MONEY OUT OF WHAT THEY READ.',
        '',
        'The return dialog turns every line into quantity times unit_price and',
        'inserts the result - the same shape closed in the bill list in 936. It now',
        'refuses before it reads, and says why.',
        '',
        'The second is worse and is new: changing a bill status COPIES THE BILL',
        'TOTALS INTO THE LINKED PURCHASE ORDER. Reading a hidden amount and',
        'carrying on would write blanks over correct figures IN A DOCUMENT NOBODY',
        'HAS OPEN - a silent corruption discovered only much later. And skipping in',
        'silence is no better: the order keeps stale numbers and nothing says so.',
        'It now REFUSES OUT LOUD.',
        '',
        'MEASURED BEFORE CHOOSING TO REFUSE: bills.can_update on this company is',
        'granted to the accountant, the admin and the owner only - the manager and',
        'the viewer cannot change a bill status at all. The accountant and the owner',
        'are both in the cost audience, so refusing blocks no real work today. The',
        'admin is the one gap, and it is the already-recorded debt that',
        'can_view_purchase_cost does not name admin while every other rule does -',
        'with zero admin members in any company, measured.',
        '',
        'AND THE PROPER LONG-TERM CURE IS RECORDED, not pretended: a document',
        'consequence should never depend on who is looking, so the purchase-order',
        'sync belongs on the server. Today the refusal is safe and measured; the',
        'move is written into the handover rather than assumed done.',
        '',
        'NO LYING ZERO HERE EITHER: the total card, the net-of-returns line, the',
        'line totals and the remaining-amount card all read as a dash when the',
        'amount is hidden, and the remaining amount is null rather than',
        'total-minus-paid computed from a blank.',
        '',
        'THE CONVERTED SCREEN JOINED THE RATCHET IN THE SAME RELEASE - a file',
        'converted but not listed is a file nobody watches. Three screens converted,',
        '141 direct reads remain elsewhere, printed every run.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.937 pushed - the bill screen reads its money through the masked path" -ForegroundColor Green
}
