$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.470.ps1") { Remove-Item -LiteralPath "push_v3.74.470.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.471"') {
    Write-Host "+ 3.74.471" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "supabase/migrations/20260701000471_v3_74_471_history_shows_diffcard.sql")) {
    Write-Host "X migration 471 missing" -ForegroundColor Red; exit 1
}
Write-Host "+ migration 471 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'BR\. ?سجل الاعتمادات يعرض DiffCard') {
    Write-Host "X CONTRACTS.md missing Section BR" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section BR" -ForegroundColor Green

$page = Get-Content -LiteralPath "app/approvals/page.tsx" -Raw
if ($page -notmatch 'raw_current' -or $page -notmatch 'raw_prior') {
    Write-Host "X approvals page missing raw_current/raw_prior" -ForegroundColor Red; exit 1
}
Write-Host "+ approvals page passes raw snapshots to DiffCard" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $tscErr TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_471.txt"
    $msgLines = @(
        'feat(history): v3.74.471 - approval history entries embed the full AmendmentDiffCard',
        '',
        'Owner: I want the history entry to show what was shown at',
        'approval time, so I know the full cycle of the bill.',
        '',
        'v3.74.470 added a badge + delta line, but only for a summary.',
        'This release renders the same AmendmentDiffCard the owner saw',
        'when approving - inline in the history entry.',
        '',
        'UnifiedHistoryEntry now carries raw_current and raw_prior with',
        'full snapshots. UnifiedHistoryCard renders AmendmentDiffCard',
        'inline whenever is_amendment=true and both snapshots exist.',
        '',
        'The DiffCard already shows: rejection context, before/after',
        'across all financial fields, position, tax_inclusive, party,',
        'and added/removed/modified line items with full detail.',
        '',
        'Purchases and sales use the same code path.',
        '',
        'Files',
        '   supabase/migrations/20260701000471_v3_74_471_history_shows_diffcard.sql',
        '   app/approvals/page.tsx',
        '   CONTRACTS.md (Section BR added)',
        '   lib/version.ts -> 3.74.471'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.471 pushed - history rows now show the full DiffCard" -ForegroundColor Green
}
