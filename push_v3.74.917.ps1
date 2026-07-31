$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.917 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.916.ps1") { Remove-Item -LiteralPath "push_v3.74.916.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.917"') {
    Write-Host "+ 3.74.917" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.917]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.917]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$migration = "supabase/migrations/20260731000007_v3_74_917_branch_isolation_actually_works.sql"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $migration,
           "scripts/check-branch-isolation-holes.js",
           "scripts/selftest-branch-isolation-holes.js",
           "push_v3.74.917.ps1")

$m = Get-Content -LiteralPath $migration -Raw

# -- 1. every permissive policy that swallows the isolation is DROPPED ---
# Permissive policies are OR-ed. One open policy beside a correct
# branch-isolation policy means NO isolation - and it is worse than having
# none, because a reader of the database sees the rule written and relaxes.
foreach ($needle in @("DROP POLICY IF EXISTS bills_select",
                      "DROP POLICY IF EXISTS invoices_select",
                      "DROP POLICY IF EXISTS journal_entries_select",
                      "DROP POLICY IF EXISTS payments_select",
                      "DROP POLICY IF EXISTS purchase_order_items_select")) {
    if ($m -notmatch [regex]::Escape($needle)) {
        Write-Host "X an open policy is left beside the isolation ($needle)" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ every permissive policy that swallowed the branch isolation is dropped" -ForegroundColor Green

# -- 2. and the CHILD rows ask about the branch too ----------------------
# The price lives in the lines, not the header. Closing the header alone
# leaves the purchase price readable by any member of the company - which
# is exactly the back door that bypassed the whole cost hide (906-916).
foreach ($fn in @("can_access_bill_items", "can_access_invoice_items",
                  "can_access_journal_lines", "can_access_purchase_order_items")) {
    if ($m -notmatch [regex]::Escape("FUNCTION public.$fn")) {
        Write-Host "X $fn is not rewritten - the line rows stay company-wide" -ForegroundColor Red; exit 1
    }
}
$calls = ([regex]::Matches($m, [regex]::Escape("RETURN public.can_access_record_branch("))).Count
if ($calls -lt 4) {
    Write-Host "X only $calls child function(s) ask about the branch - four are required" -ForegroundColor Red
    exit 1
}
Write-Host "+ all four line-level paths are scoped by the branch of their parent document" -ForegroundColor Green

# -- 3. a company-wide member is not locked out --------------------------
# can_access_record_branch used to fall through to `v_user_branch_id =
# p_branch_id`, and for a member with NO branch that is NULL = X => NULL =>
# read as a refusal. It never showed because every member on production
# carries a branch - it would have detonated the DAY isolation was turned
# on, which is this release.
if ($m -notmatch [regex]::Escape("IF v_user_branch_id IS NULL THEN")) {
    Write-Host "X a company-wide member (no branch) would lose every branch document" -ForegroundColor Red
    exit 1
}
Write-Host "+ a member with no branch on his membership keeps company-wide sight" -ForegroundColor Green

# -- 4. the notification does not carry the number out of its branch -----
if ($m -notmatch [regex]::Escape("v_company_wide_count")) {
    Write-Host "X the bill notification still falls back to another branch's accountant" -ForegroundColor Red
    exit 1
}
Write-Host "+ the bill notification falls back to company-wide accountants, then owner/GM" -ForegroundColor Green

# -- 5. the battery below still proves the standing guards ----------------
$self2 = Get-Content -LiteralPath "push_v3.74.917.ps1" -Raw
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
Write-Host "+ the battery plants its probes and watches every guard refuse, every release" -ForegroundColor Green

# ---------------------------------------------------------------------------
git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.916.ps1" 2>$null

# -- 6. nothing staged beyond this release (the 872 lesson) --------------
$expected = @($files) + @("push_v3.74.916.ps1")
$stagedNow = git diff --cached --name-only
foreach ($p in $stagedNow) {
    if ($expected -notcontains $p) {
        Write-Host "X staged but not part of this release: $p" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ nothing is staged beyond this release's file list" -ForegroundColor Green

Write-Host "Proving the branch-isolation guard catches the real leak (TEST database only)..." -ForegroundColor Cyan
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
git add -u -- "push_v3.74.916.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if ($staged -match "backups/.*\.(sql|dump)$") {
    Write-Host "X a backup file is staged - production data. STOP." -ForegroundColor Red; exit 1
}
if ($staged -match "\.env") { Write-Host "X an env file got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "zz-probe") { Write-Host "X a self-test probe got staged - stop" -ForegroundColor Red; exit 1 }
if ($staged -match "_to_delete") { Write-Host "X a scratch folder got staged - stop" -ForegroundColor Red; exit 1 }

foreach ($f in $files) {
    $pending = git status --porcelain -- $f
    if ($pending -and ($staged -notcontains $f)) {
        Write-Host "X $f has pending changes that failed to stage" -ForegroundColor Red; exit 1
    }
}

if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_917.txt"
    $msgLines = @(
        'feat(security): v3.74.917 - branch isolation actually works (it was written and disabled)',
        '',
        'THE OWNER FOUND IT HIMSELF, by accident: a notification reached the',
        'MAIN branch accountant about a purchase bill of the NASR CITY branch.',
        'He opened it and read the supplier, the quantities and the UNIT PRICE',
        'of 100. Confirmed on production by impersonating him: header 1,',
        'lines 1, price 100.00.',
        '',
        'Cause: the same trap guarded in 915, standing here for a long time.',
        'bills carries TWO permissive SELECT policies - one correct, scoped by',
        'branch, and one saying is_company_member(company_id). Permissive',
        'policies are OR-ed, so the second swallows the first and the isolation',
        'is ink. That is worse than having none, because a reader of the',
        'database sees the rule written and relaxes.',
        '',
        'And it was not bills alone. The same pairing sits on FOUR tables:',
        'bills, invoices, JOURNAL ENTRIES and PAYMENTS.',
        '',
        'The children were wider than the parents. can_access_bill_items,',
        'can_access_invoice_items and can_access_journal_lines all read',
        'company_id from the parent and then say is_company_member, with no',
        'question about the branch. So closing the header leaves the line open',
        '- and the PRICE lives in the line. That is the back door that',
        'bypassed the entire cost hide of 906-916: the column was revoked from',
        'the product card, and the same number was read off the bill line.',
        '',
        'THE LESSON, and why the new guard measures EFFECT not TEXT: I first',
        'wrote a sweep that read policy definitions, and it PASSED',
        'purchase_order_items_select - its name suggests the owner, and its',
        'first line is companies.user_id = auth.uid(). Then I measured the',
        'effect and found a branch employee still reading another branch line',
        'items: in its tail, cut off from my view, UNION SELECT',
        'company_members.company_id - every member. Text deceives: a',
        'reassuring name, a correct first line, and a tail that opens',
        'everything.',
        '',
        'A latent bug is closed with it: can_access_record_branch fell through',
        'to v_user_branch_id = p_branch_id, and for a member with NO branch',
        'that is NULL = X => NULL => read as a refusal, locking him out of',
        'every branch document. It never showed because all 7 production',
        'members carry a branch - it would have detonated the day isolation was',
        'turned on, which is this release.',
        '',
        'The notification itself was a leak: its text carries the bill amount.',
        'It looked for accountants of the bill branch and, finding none, fell',
        'back to ALL accountants of the company. Nasr City has no accountant,',
        'so it fell to the main branch one. The fallback is now company-wide',
        'accountants, then owner/GM - never another branch accountant.',
        '',
        'Measured on production, before: every member saw 7 bills, 7 invoices,',
        '75 journal entries, 19 payments - exactly what the owner sees. After:',
        'every branch member 5 / 5 / 60 / 9, owner unchanged, and BILL-0007 for',
        'the accountant is header 0, lines 0, no price.',
        '',
        'INTENDED CONSEQUENCE the owner approved explicitly: a branch',
        'accountant no longer sees other branches journal entries or payments,',
        'so his trial balance and financial reports are now his branch alone.',
        '',
        'The new guard impersonates a real branch-bound member on the LIVE',
        'database and counts how many rows of ANOTHER branch he can read,',
        'across four document tables and four line tables, inside a rolled-back',
        'transaction. Zero, or the build stops. Its selftest plants the real',
        'defect - the permissive policy, and the child function that forgets',
        'the branch - and watches the guard name them.',
        '',
        'NOT DONE, and measured rather than assumed: the same impersonation',
        'across every table shows a branch member still reads other branches',
        'rows in 19 tables. Some are reference data by design; among the rest',
        'are purchase orders, sales orders, estimates, returns, stock',
        'movements, FIFO layers, COGS, suppliers and bookings. The owner chose',
        'to close these four and their children now, and take the rest table',
        'by table with its own measurement.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.917 pushed - branch isolation is measured, not claimed: a branch member reads zero rows of another branch" -ForegroundColor Green
}
