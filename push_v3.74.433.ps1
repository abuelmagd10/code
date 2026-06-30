$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.432.ps1") { Remove-Item -LiteralPath "push_v3.74.432.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.433"') {
    Write-Host "+ 3.74.433" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000433_v3_74_433_fix_notify_decision_enum_coercion.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 433 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'AG\. ?HOTFIX enum coercion') {
    Write-Host "X CONTRACTS.md missing Section AG" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section AG" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_433.txt"
    $msgLines = @(
        'fix(approvals): v3.74.433 HOTFIX - notify_discount_decision_trg enum coercion',
        '',
        'Owner caught it on the first discount rejection: HTTP 500.',
        'Logs showed:',
        '   ERROR: invalid input value for enum discount_document_type: "bill"',
        '   PL/pgSQL function notify_discount_decision_trg() line 40',
        '',
        'The trigger built notifications.reference_type with a CASE that',
        'mixed enum-valid THEN values (purchase_order, sales_order,',
        'booking) with non-enum strings (bill, invoice). Because ELSE',
        'returned the enum itself, the CASE result type was inferred as',
        'discount_document_type and Postgres tried to coerce every THEN',
        'literal to the enum domain. bill is not a member -> the planner',
        'rejected the whole INSERT even when the matched branch was',
        'purchase_order.',
        '',
        'Fix: cast both CASE input and ELSE to text. The result is now',
        'text, comparisons are text-to-text, no enum coercion happens.',
        '',
        'Lesson recorded: when building a CASE on an enum column whose',
        'output is a different text vocabulary, cast the input AND the',
        'ELSE to text up front.',
        '',
        'Files',
        '   supabase/migrations/20260630000433_v3_74_433_fix_notify_decision_enum_coercion.sql',
        '   CONTRACTS.md (Section AG added)',
        '   lib/version.ts -> 3.74.433'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.433 pushed - discount rejection notification works" -ForegroundColor Green
}
