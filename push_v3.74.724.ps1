$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.723.ps1") { Remove-Item -LiteralPath "push_v3.74.723.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.724"') {
    Write-Host "+ 3.74.724" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (Test-Path ".githooks/pre-push") { git config core.hooksPath .githooks 2>&1 | Out-Null }

$cl = Get-Content -LiteralPath "CHANGELOG.md" -Raw
if ($cl -notmatch [regex]::Escape("[3.74.724]")) { Write-Host "X CHANGELOG missing [3.74.724]" -ForegroundColor Red; exit 1 }
Write-Host "+ CHANGELOG documents this release" -ForegroundColor Green

Write-Host "Dumping DB functions..." -ForegroundColor Cyan
node scripts/dump-db-functions.js
if ($LASTEXITCODE -ne 0) { Write-Host "X dump-db-functions failed" -ForegroundColor Red; exit 1 }

# The widget must render `subject` generically. Without it a checker's findings
# collapse into identical rows - the dashboard shows one fixed hint per CHECK,
# not per finding.
$w = Get-Content -LiteralPath "app/dashboard/_widgets/SystemIntegrityWidget.tsx" -Raw
if ($w -notmatch "f\.detail\?\.subject") {
    Write-Host "X the integrity widget no longer renders detail.subject" -ForegroundColor Red; exit 1
}
Write-Host "+ widget renders the finding subject" -ForegroundColor Green

$fn = Get-Content -LiteralPath "supabase/schema/functions.sql" -Raw
if ($fn -notmatch "'subject'") {
    Write-Host "X no checker emits a subject - findings would be indistinguishable" -ForegroundColor Red; exit 1
}
Write-Host "+ checker emits a subject per finding" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
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
    "app/dashboard/_widgets/SystemIntegrityWidget.tsx" `
    "supabase/migrations/20260719000724_v3_74_724_integrity_finding_subject.sql" `
    "supabase/schema/functions.sql" `
    "push_v3.74.724.ps1" 2>&1 | Out-Null
git add -u -- "push_v3.74.723.ps1" 2>$null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_724.txt"
    $msgLines = @(
        'fix(dashboard): v3.74.724 - seven findings rendered as seven identical rows',
        '',
        'The customer-isolation checker fired correctly - three orphaned customers',
        'and four cross-branch documents, exactly what it was built to catch. But',
        'the dashboard showed them as seven identical rows: no customer name, no',
        'document number, nothing to act on.',
        '',
        'The widget renders detail->>hint, which is one fixed sentence per CHECK',
        'rather than per finding, plus a hardcoded list of three keys: difference,',
        'invoice_number, product_name. A checker emitting anything else shows',
        'nothing identifying. Same two-sources-of-truth shape as the other fixes',
        'today - adding a checker implicitly required editing the widget, and',
        'nothing enforced or even hinted at that.',
        '',
        'subject is now the convention: one short line naming the record, rendered',
        'generically above the hint. Existing checkers are untouched and keep',
        'working; the next one becomes actionable without going near the dashboard.',
        '',
        'Before: "Customer belongs to one branch while the staff member..." x7',
        'After:  the customer <name> - branch: <x> - creator moved to: <y>',
        '        invoice INV-2026-00002 (branch x) - customer <name> from branch y'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.724 pushed - every finding names its record" -ForegroundColor Green
}
