$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
# Square brackets are glob characters in a git pathspec. Literal pathspecs turn
# that off for every git call below. (858 lesson: -LiteralPath for Test-Path.)
$env:GIT_LITERAL_PATHSPECS = "1"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
# v3.74.935 - the OLD script is removed, never this one. Five times a chained
# string-replace turned this line into self-deletion (861, 865, 866, 870, 871).
# This line is written by hand, every release, without exception.
if (Test-Path -LiteralPath "push_v3.74.934.ps1") { Remove-Item -LiteralPath "push_v3.74.934.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.935"') {
    Write-Host "+ 3.74.935" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.935]")) {
    Write-Host "X CHANGELOG needs a heading containing exactly [3.74.935]" -ForegroundColor Red; exit 1
}
Write-Host "+ CHANGELOG heading matches the hook" -ForegroundColor Green

# ---------------------------------------------------------------------------
$migration = "supabase/migrations/20260801000001_v3_74_935_products_are_created_by_their_owners.sql"
$guard     = "scripts/check-product-management-one-door.js"
$trap      = "scripts/selftest-product-management-one-door.js"

$files = @("lib/version.ts", "CHANGELOG.md", "docs/HANDOVER_2026-07-24.md",
           $migration, $guard, $trap,
           "supabase/schema/functions.sql",
           "push_v3.74.935.ps1")

$m = Get-Content -LiteralPath $migration -Raw
$g = Get-Content -LiteralPath $guard -Raw
$t = Get-Content -LiteralPath $trap -Raw

# Measure on CODE only - a comment is not an instruction (930, 932, 934).
$mCode = ($m -split "`n" | Where-Object { $_ -notmatch "^\s*--" }) -join "`n"

# -- 1. one rule, and it names every role the owner named ---------------
foreach ($role in @("owner", "admin", "general_manager", "manager",
                    "accountant", "store_manager", "purchasing_officer")) {
    if ($mCode -notmatch [regex]::Escape("'$role'")) {
        Write-Host "X can_manage_products does not name $role - that role loses the products screen" -ForegroundColor Red
        exit 1
    }
}
foreach ($blocked in @("'staff'", "'manufacturing_officer'", "'booking_officer'", "'hr_officer'")) {
    if ($mCode -match [regex]::Escape($blocked)) {
        Write-Host "X $blocked is still named - the owner asked for it to be blocked" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ one rule, naming exactly the roles the owner named" -ForegroundColor Green

# -- 2. the policies CALL the rule, and there is one door per write -----
if ($mCode -notmatch [regex]::Escape("WITH CHECK (public.can_manage_products(company_id))")) {
    Write-Host "X the INSERT policy does not call the rule" -ForegroundColor Red; exit 1
}
if ($mCode -notmatch [regex]::Escape("USING      (public.can_manage_products(company_id))")) {
    Write-Host "X the UPDATE policy does not call the rule" -ForegroundColor Red; exit 1
}
foreach ($dropped in @("DROP POLICY IF EXISTS products_insert ", "DROP POLICY IF EXISTS products_insert_members",
                       "DROP POLICY IF EXISTS products_update ", "DROP POLICY IF EXISTS products_update_members")) {
    if ($mCode -notmatch [regex]::Escape($dropped)) {
        Write-Host "X a second permissive door survives ($dropped)" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ one door per write, and the rule is called, not restated" -ForegroundColor Green

# -- 3. THE REAL DOOR: the definer creator asks about the role ----------
# The screen never inserts into products - measured, zero sites. Creation goes
# through create_product_atomic, which is SECURITY DEFINER, so the row policy
# never runs inside it. Narrowing the policy alone would have been a placebo.
if ($mCode -notmatch [regex]::Escape("can_manage_products(p_company_id)")) {
    Write-Host "X create_product_atomic is not given the role check - the real door stays open" -ForegroundColor Red
    exit 1
}
if ($mCode -notmatch [regex]::Escape("refusing to patch blindly")) {
    Write-Host "X the patch does not refuse when its anchor moved (932 lesson)" -ForegroundColor Red; exit 1
}
if ($mCode -notmatch [regex]::Escape("already guarded, left as is")) {
    Write-Host "X re-running the migration would insert the check twice" -ForegroundColor Red; exit 1
}
Write-Host "+ the definer creator asks about the role, patched at an anchor, once" -ForegroundColor Green

# -- 4. and the shared helper is NOT narrowed --------------------------
# can_modify_data is used by other tables. Narrowing it would cut what was
# never measured.
if ($mCode -match [regex]::Escape("CREATE OR REPLACE FUNCTION public.can_modify_data")) {
    Write-Host "X the migration rewrites can_modify_data - a shared helper used by other tables" -ForegroundColor Red
    exit 1
}
if ($mCode -notmatch [regex]::Escape("REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon")) {
    Write-Host "X the re-created creator is left open to PUBLIC/anon (919/929)" -ForegroundColor Red; exit 1
}
Write-Host "+ the shared helper is untouched, and the re-created function is not left open" -ForegroundColor Green

# -- 5. the guard measures the effect, and the trap plants the worst shape
if ($g -notmatch [regex]::Escape("create_product_atomic")) {
    Write-Host "X the guard does not look at the real door" -ForegroundColor Red; exit 1
}
if ($g -notmatch [regex]::Escape("ROLLBACK TO SAVEPOINT")) {
    Write-Host "X the guard does not actually try to create - it would measure text, not effect" -ForegroundColor Red
    exit 1
}
if ($t -notmatch [regex]::Escape("no longer asks about the role")) {
    Write-Host "X the trap never plants the shape that was actually live before 935" -ForegroundColor Red; exit 1
}
Write-Host "+ the guard tries it for real; the trap plants the shape that was live" -ForegroundColor Green

# -- 6. the battery below still proves the standing guards ----------------
$self2 = Get-Content -LiteralPath "push_v3.74.935.ps1" -Raw
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
Write-Host "+ the battery plants its probes and watches every guard refuse, every release" -ForegroundColor Green

# ---------------------------------------------------------------------------
# The snapshot mirrors the database, and this release rewrites two functions.
Write-Host "Refreshing the function snapshot from the live database..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X could not refresh supabase/schema/functions.sql" -ForegroundColor Red; exit 1 }

git add -- $files 2>&1 | Out-Null
git add -u -- "push_v3.74.934.ps1" 2>$null

# -- 7. nothing staged beyond this release (the 872 lesson) --------------
$expected = @($files) + @("push_v3.74.934.ps1")
$stagedNow = git diff --cached --name-only
foreach ($p in $stagedNow) {
    if ($expected -notcontains $p) {
        Write-Host "X staged but not part of this release: $p" -ForegroundColor Red
        exit 1
    }
}
Write-Host "+ nothing is staged beyond this release's file list" -ForegroundColor Green

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
git add -u -- "push_v3.74.934.ps1" 2>$null
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_935.txt"
    $msgLines = @(
        'fix(security): v3.74.935 - products are created by their owners, and the real door is shut',
        '',
        'THE OWNER DECIDED: creating and editing items is for the owner, the admin,',
        'the general manager, the branch manager, the accountant, the store keeper',
        'and the purchasing officer. The salesman and the manufacturing officer are',
        'blocked - and so are the booking and HR officers, who were also getting',
        'through.',
        '',
        'THE WRITTEN DOOR WAS NOT THE REAL ONE. products had TWO permissive INSERT',
        'policies: one naming six roles, another delegating to can_modify_data,',
        'which passes eleven - everybody. Same for UPDATE. That is the permissive',
        'policy shape again (921, 928, 929, 930, 931).',
        '',
        'BUT NARROWING THEM ALONE WOULD HAVE BEEN A PLACEBO THAT LOOKED COMPLETE.',
        'The screen never inserts into products at all - measured: ZERO sites in the',
        'whole tree. Creation goes through create_product_atomic, which is SECURITY',
        'DEFINER, so the row policy NEVER RUNS INSIDE IT. All it asked was',
        'assert_company_access: are you a member of this company - not in what role.',
        '',
        'PROVEN BEFORE THE CURE: the real path was called by impersonating all seven',
        'roles on production, and EVERY ONE OF THEM created an item successfully -',
        'the salesman and the manufacturing officer included.',
        '',
        'AND THE FUNCTION HAS TWO OVERLOADS (sixteen and seventeen parameters), both',
        'SECURITY DEFINER, both granted to authenticated. The screen calls one; the',
        'other was a sleeping back door. Both are shut.',
        '',
        'ONE RULE, CALLED FROM TWO PLACES (the 934 lesson applied). can_manage_products',
        'is written once and called by BOTH the row policy and the definer function,',
        'so closing one closes the other and no text can claim what no effect',
        'supports. can_modify_data was NOT narrowed - it is shared with other tables,',
        'and narrowing it would cut what was never measured.',
        '',
        'THE BODIES ARE NOT COPIED INTO THE MIGRATION (932 lesson). Each overload is',
        'read from the database, the anchor is verified, and the check is inserted',
        'after it - RAISING if the anchor moved, and skipping if the check is already',
        'there, so re-running cannot double it.',
        '',
        'MEASURED AFTER, BY ACTUALLY TRYING, ROLLED BACK: the accountant, the branch',
        'manager, the store keeper, the purchasing officer and the owner create and',
        'edit as before; the manufacturing officer and the salesman are REFUSED and',
        'edit ZERO rows. AND WHAT EACH CAN READ IS UNCHANGED - counted before and',
        'after the attempt for every member. The narrowing is on who writes, not on',
        'who looks.',
        '',
        'THE GUARD MEASURES THE REAL DOOR, not the written one: it tries to create',
        'and to edit as every member inside a rolled-back transaction. And the trap',
        'plants the worst shape - a definer creator that stopped asking about the',
        'role - which is exactly the state that was live until this release.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.935 pushed - products are created by their owners, and the real door is shut" -ForegroundColor Green
}
