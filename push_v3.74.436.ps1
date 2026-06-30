$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.435.ps1") { Remove-Item -LiteralPath "push_v3.74.435.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.436"') {
    Write-Host "+ 3.74.436" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AJ\. ?HOTFIX getActiveCompanyId') {
    Write-Host "X CONTRACTS.md missing Section AJ" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AJ" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_436.txt"
    $msgLines = @(
        'fix(approvals): v3.74.436 HOTFIX - loadHistory cannot import server helper',
        '',
        'v3.74.435 added loadHistory that called getActiveCompanyId(supabase)',
        'without importing it. The function lives in @/lib/company (server-',
        'only) and would not import cleanly into a client component anyway.',
        'tsc:',
        '   error TS2304: Cannot find name getActiveCompanyId.',
        '',
        'Switched loadHistory to the same cookie parse that load() already',
        'uses earlier in the file (active_company_id cookie). No server',
        'imports.',
        '',
        'Files',
        '   app/approvals/page.tsx',
        '   CONTRACTS.md (Section AJ added)',
        '   lib/version.ts -> 3.74.436'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.436 pushed - history loader fixed" -ForegroundColor Green
}
