$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.329.ps1") { Remove-Item -LiteralPath "push_v3.74.329.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.330"') {
    Write-Host "+ 3.74.330" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$vlib = Get-Content -LiteralPath "lib/validation.ts" -Raw
foreach ($n in @(
    'v3.74.330 — booking_officer follows a branch-wide rule',
    "roleLower === 'booking_officer'"
)) {
    if ($vlib -notmatch [regex]::Escape($n)) {
        Write-Host "X validation.ts missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ getAccessFilter: booking_officer case handled" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_330.txt"
    $msgLines = @(
        'fix(authz): v3.74.330 - booking_officer customer filter',
        '',
        'Owner tested a booking_officer with no branch and saw zero',
        'customers, even though v3.74.328 widened the RLS to grant',
        'company-wide SELECT. Tracing the request showed the row was',
        'reachable at the database — but the page was passing the',
        'customers RPC a filterByCreatedBy = true / createdByUserId =',
        'userId pair from getAccessFilter(), so it filtered the result',
        'back down to only the rows the officer personally created.',
        '',
        'Root cause: getAccessFilter() fell through to the generic',
        '"Staff/Sales/Employee — only own creations" return for any',
        'role not explicitly matched above. booking_officer was never',
        'added, so the function applied the wrong policy.',
        '',
        'Added an explicit booking_officer case mirroring the new RLS:',
        '   * userBranchId IS NULL  -> no client-side filter (RLS gates',
        '                              the company boundary; floating',
        '                              officer sees everything in the',
        '                              company)',
        '   * userBranchId set      -> filterByBranch = true, branchId =',
        '                              userBranchId (so the RPC scopes',
        '                              to the officer''s branch, matching',
        '                              the customers_booking_officer_',
        '                              select_branch policy).',
        '',
        'Files',
        '  lib/validation.ts',
        '  lib/version.ts -> 3.74.330'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.330 pushed" -ForegroundColor Green
}
