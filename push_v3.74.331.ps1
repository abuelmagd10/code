$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.330.ps1") { Remove-Item -LiteralPath "push_v3.74.330.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.331"') {
    Write-Host "+ 3.74.331" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# governance-middleware
$gov = Get-Content -LiteralPath "lib/governance-middleware.ts" -Raw
foreach ($n in @(
    'v3.74.331 — Some roles are legitimately allowed to operate without',
    '_branchOptionalRoles',
    'isFloatingBookingOfficer',
    "case 'booking_officer'"
)) {
    if ($gov -notmatch [regex]::Escape($n)) {
        Write-Host "X governance-middleware missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ governance-middleware: booking_officer + floating roles handled" -ForegroundColor Green

# Customer form dialog
$cfd = Get-Content -LiteralPath "components/customers/customer-form-dialog.tsx" -Raw
foreach ($n in @(
    'v3.74.331 — branch picker',
    'needsBranchPicker',
    'isFloatingBookingOfficer',
    'يجب اختيار الفرع',
    "{ branch_id: formData.branch_id }"
)) {
    if ($cfd -notmatch [regex]::Escape($n)) {
        Write-Host "X CustomerFormDialog missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ CustomerFormDialog: branch dropdown wired" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_331.txt"
    $msgLines = @(
        'feat(customers): v3.74.331 - branch picker for owner / admin / floating booking_officer',
        '',
        'Owner asked that the "new customer" form expose a branch dropdown',
        'when the creator does not naturally belong to one branch:',
        '   * owner',
        '   * admin (label "مدير عام" in the users UI)',
        '   * booking_officer with no branch_id (v3.74.329 floating role)',
        '',
        'Every other role keeps the existing behaviour - the branch is',
        'auto-assigned from member.branch_id on the server, no UI change.',
        '',
        'Governance middleware',
        '   buildGovernanceContext() used to hard-throw',
        '     "Governance Error: User has no branch assigned"',
        '   the moment any logged-in user had member.branch_id IS NULL.',
        '   That meant a floating booking_officer (which the owner just',
        '   created via /settings/users) could not save ANYTHING via',
        '   the API. The check now whitelists owner / admin /',
        '   general_manager / booking_officer when no branch is set.',
        '   The admin case also tolerates primary = NULL when building',
        '   context.branchIds. A new case for booking_officer mirrors',
        '   admin when unassigned and manager when assigned to a',
        '   branch. addGovernanceData() recognises a "floating"',
        '   booking_officer (multiple branchIds available) so it honours',
        '   the branch_id picked in the form instead of overwriting it.',
        '',
        'CustomerFormDialog',
        '   Loads the current member''s role + branch on dialog open.',
        '   Loads the company''s branches once. Renders a required',
        '   "الفرع" dropdown above the customer name field WHEN the',
        '   creator is company-scope or a floating booking_officer.',
        '   Validation refuses to submit until a branch is chosen.',
        '   Branch_id is sent in the POST body only for those roles —',
        '   others fall through to the server-side governance default',
        '   like they did before.',
        '',
        'No DB migration. customers.branch_id is already nullable and',
        'the new RLS we added in v3.74.327 / v3.74.328 still applies.',
        '',
        'Files',
        '  lib/governance-middleware.ts',
        '  components/customers/customer-form-dialog.tsx',
        '  lib/version.ts -> 3.74.331'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.331 pushed" -ForegroundColor Green
}
