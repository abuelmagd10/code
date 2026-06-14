$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.148.ps1") { Remove-Item -LiteralPath "push_v3.74.148.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.149"') { Write-Host "+ 3.74.149" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

# Sanity: ensure route file ends with a closing brace (no truncation)
$route = Get-Content -LiteralPath "app/api/payments/[id]/resubmit-after-reject/route.ts" -Raw
if ($route.TrimEnd().EndsWith("}")) {
    Write-Host "+ route file intact" -ForegroundColor Green
} else {
    Write-Host "X route file is truncated!" -ForegroundColor Red
    exit 1
}

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
if (-not $staged) { Write-Host "Nothing to commit" -ForegroundColor Yellow } else {
    git commit -m "fix(payments): v3.74.149 - diagnose persistent 404 on resubmit-after-reject

Background: after v3.74.148 (service client for the initial SELECT) the
404 'الدَّفعَة غَير مَوجودَة' is still being returned to the accountant
when they hit 'تَعديل وإِعادَة الإِرسال' on a rejected supplier payment.
DB inspection confirms the row exists with the matching company_id and
RLS lets the accountant see it. The Vercel runtime log shows the
request reaching the deployment but only surfaces the Supabase
'Using the user object as received' warning — the route handler's
console.log lines were not visible, leaving us guessing about which
guard fired.

This change does two things:

  app/api/payments/[id]/resubmit-after-reject/route.ts
    - Adds [RESUBMIT_V149] tagged console.logs at every decision point
      (auth, getActiveCompanyId, service client construction, payment
      SELECT result, and update/notify failures).
    - Wraps createServiceClient() in its own try/catch so that a missing
      SUPABASE_SERVICE_ROLE_KEY surfaces as a 500 with a clear message
      instead of a misleading 404.
    - Includes a {debug} object in the 404 response body so the cause
      reaches the browser console even when Vercel logs hide it.
    - Drops the negative-sign rewrite on amount. The DB row for this
      payment is stored as positive 3.00 (verified directly), so flipping
      to -Math.abs() was writing -3.00 and breaking the magnitude.

  lib/version.ts
    - Bump to 3.74.149.

Once deployed, the next failed click will tell us exactly which step
fails — or, if everything succeeds, complete the resubmit." 2>&1 | ForEach-Object { Write-Host $_ }
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.149 pushed" -ForegroundColor Green
}
