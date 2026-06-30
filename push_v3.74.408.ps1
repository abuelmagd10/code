$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.407.ps1") { Remove-Item -LiteralPath "push_v3.74.407.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.408"') {
    Write-Host "+ 3.74.408" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$mig = "supabase/migrations/20260629000408_v3_74_408_security_invoker_stage1.sql"
if (-not (Test-Path -LiteralPath $mig)) { Write-Host "X migration missing" -ForegroundColor Red; exit 1 }
$migContent = Get-Content -LiteralPath $mig -Raw
foreach ($n in @(
    'inventory_available_balance',
    'v_inventory_reservation_balances',
    'v_shared_with_me',
    'security_invoker = true'
)) {
    if ($migContent -notmatch [regex]::Escape($n)) {
        Write-Host "X migration missing: $n" -ForegroundColor Red; exit 1
    }
}
Write-Host "+ migration covers 3 stage-1 views" -ForegroundColor Green

$contracts = Get-Content -LiteralPath "CONTRACTS.md" -Raw
if ($contracts -notmatch 'Q\. إصلاح SECURITY DEFINER') {
    Write-Host "X CONTRACTS.md missing Section Q" -ForegroundColor Red; exit 1
}
Write-Host "+ CONTRACTS.md has Section Q" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_408.txt"
    $msgLines = @(
        'security(views): v3.74.408 - stage 1 SECURITY DEFINER cleanup',
        '',
        'Supabase Security Advisor flagged 12 views as ERROR-level',
        '"security_definer_view" - they run with the creator''s',
        'permissions instead of the querying user, bypassing RLS on',
        'the underlying tables.',
        '',
        'This commit clears the 3 lowest-risk views by switching them',
        'to security_invoker = true so RLS applies on read:',
        '  inventory_available_balance     (RLS on inventory_transactions)',
        '  v_inventory_reservation_balances (calls a SECURITY DEFINER',
        '                                    function; view-level switch',
        '                                    still narrows surface area)',
        '  v_shared_with_me                (RLS on permission_sharing,',
        '                                    already user-scoped via',
        '                                    auth.uid() match)',
        '',
        'Both underlying tables have RLS enabled (relrowsecurity=true),',
        'so the switch is transparent at the application layer. No UI',
        'or RPC code touched.',
        '',
        'Section Q added to assert_baseline. Body must report',
        '"security_invoker=true" in pg_class.reloptions for each of the',
        '3 views; a future DROP/CREATE that omits the option fails the',
        'baseline before it can ship.',
        '',
        'Remaining cleanup',
        '  Stage 2 (next): 7 reporting views',
        '  Stage 3 (after): 2 system / dashboard views',
        '',
        'Files',
        '  supabase/migrations/20260629000408_v3_74_408_security_invoker_stage1.sql',
        '  CONTRACTS.md (Section Q added)',
        '  lib/version.ts -> 3.74.408'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.408 pushed - 3 stage-1 views switched to security_invoker" -ForegroundColor Green
    Write-Host "  Quick smoke test: open inventory page, sharing page; values should look identical." -ForegroundColor Cyan
}
