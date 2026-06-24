$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.322.ps1") { Remove-Item -LiteralPath "push_v3.74.322.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.323"') {
    Write-Host "+ 3.74.323" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# Migration
$mig = "supabase/migrations/20260624000323_v3_74_323_services_branch_required.sql"
if (-not (Test-Path -LiteralPath $mig)) {
    Write-Host "X migration missing: $mig" -ForegroundColor Red; exit 1
}
$mig_sql = Get-Content -LiteralPath $mig -Raw
if ($mig_sql -notmatch [regex]::Escape('ALTER COLUMN branch_id SET NOT NULL')) {
    Write-Host "X migration must restore NOT NULL on services.branch_id" -ForegroundColor Red; exit 1
}
Write-Host "+ migration: services.branch_id back to NOT NULL" -ForegroundColor Green

# API GET should be back to .eq (no OR)
$api = Get-Content -LiteralPath "app/api/services/route.ts" -Raw
if ($api -match [regex]::Escape("branch_id.is.null,branch_id.eq.")) {
    Write-Host "X old shared-service OR filter still present" -ForegroundColor Red; exit 1
}
if ($api -notmatch [regex]::Escape("v3.74.323 — shared services were rolled back")) {
    Write-Host "X API missing v3.74.323 marker" -ForegroundColor Red; exit 1
}
if ($api -notmatch [regex]::Escape("'branch_id مطلوب لإنشاء الخدمة.'")) {
    Write-Host "X API POST missing branch_id required guard" -ForegroundColor Red; exit 1
}
# isCompanyScope branching should be gone
if ($api -match "const isCompanyScope = \['owner', 'admin', 'general_manager'\]") {
    Write-Host "X stale isCompanyScope branch-pick logic still present" -ForegroundColor Red; exit 1
}
Write-Host "+ API services: clean per-branch flow" -ForegroundColor Green

# ServiceForm — no more "All branches" option
$sf = Get-Content -LiteralPath "components/services/ServiceForm.tsx" -Raw
if ($sf -match [regex]::Escape("__ALL__")) {
    Write-Host "X ServiceForm still uses __ALL__ sentinel" -ForegroundColor Red; exit 1
}
if ($sf -match [regex]::Escape("كل الفروع (مشتركة)")) {
    Write-Host "X ServiceForm still shows 'كل الفروع' option" -ForegroundColor Red; exit 1
}
if ($sf -notmatch [regex]::Escape("v3.74.323 — Branch selector (required for every service)")) {
    Write-Host "X ServiceForm missing v3.74.323 marker" -ForegroundColor Red; exit 1
}
Write-Host "+ ServiceForm: All-branches option removed, branch is required" -ForegroundColor Green

# BookingForm — service brings its branch
$bf = Get-Content -LiteralPath "components/bookings/BookingForm.tsx" -Raw
foreach ($n in @(
    'v3.74.323 — every service is now branch-bound',
    'v3.74.323 — auto-fill branch_id from the chosen service',
    'form.setValue("branch_id" as any, svc.branch_id)'
)) {
    if ($bf -notmatch [regex]::Escape($n)) {
        Write-Host "X BookingForm missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ BookingForm: branch auto-fills from selected service" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_323.txt"
    $msgLines = @(
        'refactor(services): v3.74.323 - cancel shared services, every service is branch-bound',
        '',
        'After landing v3.74.319-322 (shared services + per-branch',
        'availability + per-branch cost-center fallback), the owner',
        'pointed out a simpler structural truth: products are branch-',
        'bound, and a service is required to link to a product since',
        'v3.74.305. A service without a branch is therefore structurally',
        'inconsistent — it would reference a product whose inventory and',
        'accounts live in one branch while pretending to live in all.',
        '',
        'Decision: roll back the shared-service idea. Every service has',
        'exactly one branch. UI complications and accounting risks go',
        'away with it.',
        '',
        'Changes',
        '   DB (20260624000323): services.branch_id back to NOT NULL.',
        '       Verified zero rows had NULL before tightening — clean',
        '       forward-only constraint.',
        '   API services route:',
        '       GET booking_officer filter back to a plain .eq() — no',
        '       more OR with branch_id.is.null.',
        '       POST simplifies: branch_id required for everyone; fall',
        '       back to the caller member.branch_id, refuse if absent.',
        '   ServiceForm: removed the "كل الفروع (مشتركة)" option and the',
        '       __ALL__ sentinel. Branch dropdown is required; for',
        '       branch-scope roles it stays auto-set & disabled.',
        '   BookingForm: when the user picks a service, its branch_id is',
        '       auto-filled into the booking. The AvailabilityChecker',
        '       (which now requires branch_id since v3.74.322) gets it',
        '       for free. The eventual booking row, invoice, and journal',
        '       entries all agree on the same branch.',
        '   SimpleService interface gained branch_id so the form can',
        '       read it.',
        '',
        'What stays from v3.74.319-322',
        '   v3.74.321 schedule UPSERT — useful for any branch change.',
        '   v3.74.322 cost-center cascade falling back to',
        '       branches.default_cost_center_id — even safer now.',
        '   v3.74.322 availability route still scopes by branch_id —',
        '       same code, but branch_id now always comes from the',
        '       service.',
        '',
        'Migration was applied directly to production before this push.',
        '',
        'Files',
        '  supabase/migrations/20260624000323_v3_74_323_services_branch_required.sql (NEW)',
        '  app/api/services/route.ts',
        '  components/services/ServiceForm.tsx',
        '  components/bookings/BookingForm.tsx',
        '  lib/version.ts -> 3.74.323'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.323 pushed" -ForegroundColor Green
}
