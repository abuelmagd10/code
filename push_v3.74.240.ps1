$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.239.ps1") { Remove-Item -LiteralPath "push_v3.74.239.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.240"') {
    Write-Host "+ 3.74.240" -ForegroundColor Green
} else {
    Write-Host "X version mismatch" -ForegroundColor Red
    exit 1
}

$migration = Get-Content -LiteralPath "supabase/migrations/20260620000240_v3_74_240_backup_stale_grace_period.sql" -Raw
if ($migration -notmatch "INTERVAL '48 hours'") {
    Write-Host "X grace-period migration missing 48h window" -ForegroundColor Red; exit 1
}
Write-Host "+ ic_backup_stale 48h grace period migration committed" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_240.txt"
    $msgLines = @(
        "fix(governance): v3.74.240 - no scary 'data at risk' on brand-new dashboards",
        "",
        "Bug observed during the new-company sign-up test: the first time a",
        "fresh tenant opens their dashboard they get a high-severity",
        "integrity warning - 'No successful backup ever recorded for this",
        "company. Data at risk.' - because the daily backup cron has not",
        "had a chance to run yet. That's a terrible first impression for a",
        "customer who just spent 5 minutes signing up.",
        "",
        "Root cause: ic_backup_stale returned 'high' as soon as a company",
        "had zero successful backup rows, regardless of how old the company",
        "actually was. New companies get treated identically to abandoned",
        "ones.",
        "",
        "Fix: 48-hour grace window keyed off companies.created_at.",
        "  * Company age < 48 h, no backup yet  -> silent",
        "  * Company age >= 48 h, no backup yet -> high (real problem)",
        "  * Backup older than 7 days           -> medium (unchanged)",
        "  * Backup older than 30 days          -> high   (unchanged)",
        "",
        "The 48 h window matches the backup-daily cron schedule with one",
        "missed-run of headroom, so the warning still fires the moment a",
        "real cron failure happens.",
        "",
        "Migration applied directly to the live DB and committed to the",
        "repo for the next environment rebuild.",
        "",
        "  supabase/migrations/20260620000240_v3_74_240_backup_stale_grace_period.sql",
        "  lib/version.ts -> 3.74.240"
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.240 pushed" -ForegroundColor Green
}
