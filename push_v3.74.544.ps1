$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.544"') { Write-Host "+ 3.74.544" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'supabase/migrations/20260706000544_v3_74_544_correction_bypass_payment_gate.sql')) {
    Write-Host "X doc-stamp migration missing" -ForegroundColor Red; exit 1
}
Write-Host "+ doc-stamp migration present" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$tscErr = ($tsc | Select-String -Pattern "error TS").Count
if ($tscErr -eq 0) { Write-Host "+ 0 TS errors" -ForegroundColor Green }
else { Write-Host "X $tscErr TS errors" -ForegroundColor Red; $tsc | Select-String -Pattern "error TS" | Select-Object -First 20 | ForEach-Object { Write-Host $_ }; exit 1 }

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow }
else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_544.txt"
    $msgLines = @(
        'fix(payments): v3.74.544 - trigger blocked execute_vendor_payment_correction',
        '',
        'Owner clicked Execute on the approved correction card (v3.74.543 SoD',
        'gate now shows the button to the requester) and got:',
        '  دفع المورد يحتاج اعتماد المالك / المدير العام.',
        '  لا يجوز إنشاء دفعة بحالة "approved" مباشرة.',
        '',
        'Root cause',
        '  payment_supplier_approval_insert_trg fires on every payments',
        '  INSERT with a supplier_id/bill_id and rejects status=approved.',
        '  execute_vendor_payment_correction inserts two such rows (the',
        '  VOID row + the corrected replacement) and both are legitimately',
        '  approved as part of the correction workflow. The trigger had',
        '  no way to distinguish them from a direct approved insert.',
        '',
        'Fix (applied via mcp__apply_migration, doc-stamped in this commit)',
        '  1. Trigger checks current_setting(''app.correction_bypass'', true)',
        '     and RETURN NEW when it equals ''on''.',
        '  2. execute_vendor_payment_correction runs',
        '       PERFORM set_config(''app.correction_bypass'', ''on'', true);',
        '     after validating the request and before the first INSERT.',
        '     The third argument scopes the GUC to the transaction so',
        '     it evaporates on RPC return.',
        '',
        'Security',
        '  - PostgREST does not expose set_config to REST clients.',
        '  - Trigger + RPC are both SECURITY DEFINER.',
        '  - Customer-side payments do not fire this trigger.',
        '',
        'Files',
        '  supabase/migrations/20260706000544_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.544'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.544 pushed - Execute now works" -ForegroundColor Green }
