$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.340.ps1") { Remove-Item -LiteralPath "push_v3.74.340.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.341"') {
    Write-Host "+ 3.74.341" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$sf = Get-Content -LiteralPath "components/services/ServiceForm.tsx" -Raw
foreach ($n in @(
    'v3.74.341 — for branch-scope roles (manager), auto-fill the form',
    'form.setValue("branch_id" as any, userBranchId as any)'
)) {
    if ($sf -notmatch [regex]::Escape($n)) {
        Write-Host "X ServiceForm missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ ServiceForm: branch auto-fill for branch-scope roles" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_341.txt"
    $msgLines = @(
        'fix(services): v3.74.341 - auto-fill branch for branch manager on /services/new',
        '',
        'Owner caught the consequence of v3.74.340 immediately:',
        'A branch manager opened the new-service form, the branch',
        'dropdown showed the manager''s branch (disabled, correct), but',
        'the catalog dropdown stayed locked with "اختر الفرع أولاً" /',
        '"Pick a branch first".',
        '',
        'Why: the visual selectValue fell back to userBranchId for non-',
        'company-scope users, but form.getValues("branch_id") was still',
        'NULL because we never actually committed that value to react-',
        'hook-form. v3.74.340 then read field.value to decide whether',
        'to fetch catalog items / unlock the dropdown, and locked the',
        'flow for every branch-scope user.',
        '',
        'Added a small mount-time effect: when the access profile is',
        'ready, the user is NOT company-scope (so they can''t change',
        'the branch anyway), and the form''s branch_id is still empty,',
        'we form.setValue("branch_id", profile.branch_id). Owner /',
        'admin keep their explicit pick — no change there.',
        '',
        'Files',
        '  components/services/ServiceForm.tsx',
        '  lib/version.ts -> 3.74.341'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.341 pushed" -ForegroundColor Green
}
