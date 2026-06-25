$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.346.ps1") { Remove-Item -LiteralPath "push_v3.74.346.ps1" -Force }

# ---- version stamp -----------------------------------------------------------
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.347"') {
    Write-Host "+ 3.74.347" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

# ---- GET enrichment is flat now ---------------------------------------------
$route = Get-Content -LiteralPath "app/api/services/[id]/staff/route.ts" -Raw
foreach ($n in @(
    'v3.74.347 — Flatten the member enrichment',
    "from('user_profiles')",
    "from('employees')",
    'display_name: fullName || displayName || username || email || null'
)) {
    if ($route -notmatch [regex]::Escape($n)) {
        Write-Host "X staff route missing: $n" -ForegroundColor Red; exit 1
    }
}
if ($route -match 'company_members: memberMap\[s\.employee_user_id\]') {
    Write-Host "X staff route still nests under company_members" -ForegroundColor Red; exit 1
}
Write-Host "+ staff route: flat display_name/email/full_name on each row" -ForegroundColor Green

# ---- type-check --------------------------------------------------------------
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

# ---- commit + push -----------------------------------------------------------
git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_347.txt"
    $msgLines = @(
        'fix(services): v3.74.347 - service staff list shows employee names, not UUIDs',
        '',
        'Symptom (owner, June 24 2026):',
        '  Adding a staff member to a service succeeded after v3.74.346,',
        '  but the list rendered the raw user UUID',
        '  (e.g. 24550790-de26-4904-b900-1b9413edc6df) instead of a name.',
        '',
        'Root cause',
        '  ServiceStaffManager renders s.display_name or s.email or',
        '  s.employee_user_id as a fallback. The GET enrichment in the',
        '  route was attaching the member record as a nested object',
        '  under "company_members", which the UI never reads - so the',
        '  display fell through every level and landed on the UUID.',
        '  Worse, company_members does not actually carry display_name',
        '  - that field lives on user_profiles - so even if the UI had',
        '  read the nested shape it would still have shown nothing for',
        '  most users.',
        '',
        'Fix',
        '  Joined company_members + user_profiles + employees in the',
        '  GET handler and merged the result into a flat row:',
        '    - email comes from company_members',
        '    - full_name comes from employees (HR canonical name) when',
        '      the member is linked to an employee record',
        '    - display_name falls through full_name -> profile display',
        '      name -> username -> email -> null',
        '    - role kept for completeness',
        '  The UI now picks up display_name straight off the row.',
        '',
        'Files',
        '  app/api/services/[id]/staff/route.ts',
        '  lib/version.ts -> 3.74.347'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.347 pushed" -ForegroundColor Green
}
