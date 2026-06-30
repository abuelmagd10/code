$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.417.ps1") { Remove-Item -LiteralPath "push_v3.74.417.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.418"') {
    Write-Host "+ 3.74.418" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260630000418_v3_74_418_fix_trigger_created_by.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
Write-Host "+ migration 418 present" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'R''\. po/so_request_discount_approval_trg') {
    Write-Host "X CONTRACTS.md missing v3.74.418 entry" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has the v3.74.418 fix" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_418.txt"
    $msgLines = @(
        'hotfix(approvals): v3.74.418 - trigger referenced NEW.created_by which does not exist on PO/SO',
        '',
        'Second hotfix in the same chain (v3.74.417 fixed the enum;',
        'this one fixes the trigger body itself).',
        '',
        'Owner caught it from the postgres logs while testing PO',
        'creation right after pushing v3.74.417:',
        '  ERROR: record "new" has no field "created_by"',
        '  CONTEXT: PL/pgSQL assignment',
        '    "v_requester := COALESCE(NEW.created_by_user_id,',
        '                             NEW.created_by)"',
        '  PL/pgSQL function po_request_discount_approval_trg()',
        '                line 45 at assignment',
        '',
        'Root cause',
        '  v3.74.401 wrote po_request_discount_approval_trg by',
        '  copying the bill_request_discount_approval_trg pattern.',
        '  bills carries both created_by_user_id and created_by; the',
        '  PO and SO tables only have created_by_user_id. The',
        '  COALESCE second argument referenced a column that does not',
        '  exist on the triggering table, so as soon as the trigger',
        '  fired the entire INSERT INTO purchase_orders rolled back',
        '  with HTTP 400.',
        '',
        '  v3.74.404 inherited the same bug on sales_orders.',
        '',
        'Fix',
        '  Both triggers rewritten with',
        '    v_requester := NEW.created_by_user_id;',
        '  and the same NULL guard. Body otherwise byte-identical to',
        '  v3.74.401 / v3.74.404. Applied to live DB via Supabase MCP.',
        '',
        'Files',
        '  supabase/migrations/20260630000418_v3_74_418_fix_trigger_created_by.sql',
        '  CONTRACTS.md (R'' entry added under Section R)',
        '  lib/version.ts -> 3.74.418'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.418 pushed - PO + SO insert with discount now works" -ForegroundColor Green
}
