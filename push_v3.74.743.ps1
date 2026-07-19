$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.742.ps1") { Remove-Item -LiteralPath "push_v3.74.742.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.743"') {
    Write-Host "+ 3.74.743" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.743]")) { Write-Host "X CHANGELOG missing [3.74.743]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

$mig = "supabase/migrations/20260720000002_v3_74_743_fix_customer_branch_audit_insert.sql"
if (-not (Test-Path $mig)) { Write-Host "X migration file missing" -ForegroundColor Red; exit 1 }
$m = Get-Content -LiteralPath $mig -Raw

# The whole reason the permission never worked: entity/entity_id are GENERATED
# ALWAYS, so naming them in the INSERT aborts the UPDATE.
if ($m -match "INSERT INTO audit_logs[\s\S]{0,400}?\bentity\b\s*,") {
    Write-Host "X the trigger writes to the generated column 'entity' again - every branch change would fail" -ForegroundColor Red; exit 1
}
if ($m -notmatch "target_table") {
    Write-Host "X the trigger no longer sets target_table, which is NOT NULL" -ForegroundColor Red; exit 1
}
# audit_logs_action_check enumerates permitted actions; shortening this value
# was my first fix and it broke the insert a second way.
if ($m -notmatch "'customer_branch_changed_by_trigger'") {
    Write-Host "X the action value no longer matches audit_logs_action_check" -ForegroundColor Red; exit 1
}
Write-Host "+ trigger writes real columns with a permitted action" -ForegroundColor Green

# Layer 4: writing as the service role erases auth.uid(), which the trigger
# needs to identify the actor. Governance changes must go through the session.
$api = Get-Content -LiteralPath "app/api/customers/update/route.ts" -Raw
if ($api -notmatch "const writeClient = \(governanceFieldsInRequest\.length > 0 && isGovernanceAdmin\) \? ssr : db") {
    Write-Host "X governance changes are not written through the session client - the trigger sees no user" -ForegroundColor Red; exit 1
}
if ($api -notmatch "permittedGovernanceFields") {
    Write-Host "X the invoice gate treats an authorised branch change as a blocked field again" -ForegroundColor Red; exit 1
}
Write-Host "+ API: governance change exempt from the invoice gate, written as the user" -ForegroundColor Green

# Layers 1 and 2: the picker must appear when editing, for permitted roles.
$ui = Get-Content -LiteralPath "components/customers/customer-form-dialog.tsx" -Raw
if ($ui -match "\{!editingCustomer && needsBranchPicker && \(") {
    Write-Host "X the branch picker is hidden when editing again" -ForegroundColor Red; exit 1
}
if ($ui -notmatch "branch_id: editingCustomer\.branch_id \?\? '__shared__'") {
    Write-Host "X the picker no longer prefills - it would default to Shared and blank the branch on save" -ForegroundColor Red; exit 1
}
if ($ui -notmatch "branch_id\?: string \| null") {
    Write-Host "X Customer type lost branch_id - the prefill cannot compile" -ForegroundColor Red; exit 1
}
Write-Host "+ picker shows on edit, prefilled from the customer" -ForegroundColor Green

Write-Host "Running critical tests..." -ForegroundColor Cyan
$raw = & npx vitest run tests/critical --reporter=basic 2>&1 | Out-String
$out = $raw -replace "\x1b\[[0-9;]*[A-Za-z]", ""
$testsLine = ($out -split "`n" | Where-Object { $_ -match "^\s*Tests\s+\d" } | Select-Object -First 1)
if (-not $testsLine) { Write-Host "X could not find the Tests summary line" -ForegroundColor Red; exit 1 }
Write-Host "  $($testsLine.Trim())" -ForegroundColor DarkGray
if ($testsLine -notmatch "\btodo\b") { Write-Host "X placeholders may be passing again" -ForegroundColor Red; exit 1 }
if ($testsLine -match "(\d+)\s+passed") {
    if ([int]$Matches[1] -gt 60) { Write-Host "X $($Matches[1]) passed, expected ~50" -ForegroundColor Red; exit 1 }
    Write-Host "+ $($Matches[1]) real tests pass" -ForegroundColor Green
}

Write-Host "Running the scoping check..." -ForegroundColor Cyan
node scripts/check-service-role-scoping.js | Select-Object -Last 2
if ($LASTEXITCODE -ne 0) { Write-Host "X scoping check failed" -ForegroundColor Red; exit 1 }

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
    "components/customers/customer-form-dialog.tsx" `
    "app/api/customers/update/route.ts" `
    "push_v3.74.743.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.742.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_743.txt"
    $msgLines = @(
        'fix(customers): v3.74.743 - branch reassignment was granted and impossible',
        '',
        'The owner asked to correct two customers whose branch was recorded wrongly.',
        'I told him to edit the customer. The form answered: only address fields can',
        'be edited. My instruction was wrong, so I went looking.',
        '',
        'Five layers, each defensible alone, together making an explicitly granted',
        'permission impossible to exercise anywhere:',
        '',
        '  1. The picker renders only when creating (!editingCustomer).',
        '  2. isCustomerLocked is not role-aware, so it locked the owner too.',
        '  3. The API grants Owner/GM the right to change branch_id AND logs it,',
        '     then rejects the request a few lines later because branch_id is not',
        '     an address field - refusing the permission it had just granted.',
        '  4. The API writes with the service-role client, which has no auth.uid(),',
        '     so the database trigger saw no user, defaulted the role to staff, and',
        '     refused.',
        '  5. And underneath all of it: the trigger''s audit INSERT names the columns',
        '     entity and entity_id, both GENERATED ALWAYS. PostgreSQL rejects that',
        '     outright and the exception aborts the UPDATE.',
        '',
        'Layer 5 means the permission was not merely unreachable, it was broken.',
        'Every branch reassignment by every owner since that trigger was written has',
        'failed, with an error mentioning neither branches nor permissions. It only',
        'surfaced because I simulated the update as the owner rather than assuming',
        'the role check was the only obstacle - the role check passed, and the audit',
        'write killed it.',
        '',
        'Fixed at all five: picker shows when editing for permitted roles, prefilled',
        'from the customer; the lock keeps everything else but releases branch for',
        'those roles; the invoice gate no longer counts an authorised governance',
        'field as a blocked one; governance writes go through the session client so',
        'the trigger sees the real actor and the audit names them; and the trigger',
        'writes target_table/record_id, letting the generated columns fill',
        'themselves.',
        '',
        'One mistake of my own on the way: I shortened the audit action to',
        '"customer_branch_changed", which audit_logs_action_check does not permit -',
        'trading one broken insert for another. Identifiers that something else',
        'validates against are not free to tidy.',
        '',
        'Verified by execution, not reading: owner allowed with an audit row',
        'written; staff rejected with GOVERNANCE_VIOLATION; a no-op change passes',
        'untouched. An earlier run of that test reported "staff allowed" - because I',
        'had set the branch to the value it already held, so the trigger returned',
        'early. The test was wrong, not the guard.'
    )
    [System.IO.File]::WriteAllLines($msgPath, $msgLines)
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.743 pushed - an owner can now correct a customer's branch" -ForegroundColor Green
}
