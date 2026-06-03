# v3.58.6 hotfix - Fix unnest syntax in ai_current_user_allowed_resources
$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"

Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

$mig = "supabase/migrations/20260528000600_ai_allowed_resources_unnest_fix.sql"
if (-not (Test-Path $mig)) { Write-Host "X $mig MISSING" -ForegroundColor Red; exit 1 }
Write-Host "+ $mig" -ForegroundColor Green

$c = Get-Content $mig -Raw
if ($c -match 'FROM unnest\(v_set\) AS x WHERE x IS NOT NULL') {
    Write-Host "+ Correct unnest syntax present" -ForegroundColor Green
} else {
    Write-Host "X Fix not present" -ForegroundColor Red; exit 1
}

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }

git add $mig CHANGELOG.md
git --no-pager diff --cached --stat

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit" -ForegroundColor Yellow
} else {
    git commit -m "fix(ai-assistant): v3.58.6 hotfix - unnest syntax breaks RPC for everyone

User reported /api/ai/find-page returning matches=[] for all users
(even owner) after v3.58.5 landed.

Root cause:
  RETURN ARRAY(SELECT DISTINCT unnest(v_set) WHERE unnest IS NOT NULL);
fails with 'column unnest does not exist'. unnest is a set-returning
function, not a column reference. The Postgres planner evaluates both
sides of the RLS OR chain so the error bubbled up even for owner.

Fix:
  RETURN ARRAY(SELECT DISTINCT x FROM unnest(v_set) AS x WHERE x IS NOT NULL);

Verified on production after the fix:
- Owner 'شحن'      -> shipping_reports (score 0.83)
- Staff 'فاتورة بيع' -> estimates, sales_orders (bills filtered out)

Defense in Depth fully working again.
Zero TypeScript / app code changes." 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Write-Host "ERROR" -ForegroundColor Red; exit 1 }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.58.6 pushed" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test immediately - the migration is already applied on the DB" -ForegroundColor Cyan
    Write-Host "  No Vercel rebuild needed (DB-only fix)" -ForegroundColor White
    Write-Host "  Hard-refresh the browser then ask 'شحن' inside the assistant" -ForegroundColor White
}
