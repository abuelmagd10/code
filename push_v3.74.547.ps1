$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.547"') { Write-Host "+ 3.74.547" -ForegroundColor Green }
else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'supabase/migrations/20260706000547_v3_74_547_ai_alerts_and_ledger_sort.sql')) {
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_547.txt"
    $msgLines = @(
        'fix(reports): v3.74.547 - AI alerts remaining + banking ledger order',
        '',
        '1) ai_get_proactive_alerts subtracted only paid_amount, not',
        '   returned_amount. BILL-0001 showed remaining 4.34 instead of',
        '   the true 3.31 (7.34 total - 3.00 paid - 1.03 returned). Fixed',
        '   in the RPC (applied via mcp__apply_migration; this commit',
        '   holds the doc stamp).',
        '',
        '2) Bank/account ledger was ordered by row UUID because',
        '   PostgREST .order(referencedTable) only sorts the embedded',
        '   record, not the parent. Now we re-sort the fetched rows in',
        '   Node by (journal_entries.entry_date DESC, id DESC) so the',
        '   running-balance loop sees a truly chronological input.',
        '',
        'Files',
        '  app/api/account-lines/route.ts       (in-memory sort)',
        '  app/banking/[id]/page.tsx            (fallback in-memory sort)',
        '  supabase/migrations/20260706000547_...sql (doc stamp)',
        '  lib/version.ts -> 3.74.547'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}
git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) { Write-Host "`n+ v3.74.547 pushed" -ForegroundColor Green }
