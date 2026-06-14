$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.149.ps1") { Remove-Item -LiteralPath "push_v3.74.149.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.150"') { Write-Host "+ 3.74.150" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

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
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    # Write the commit message to a temp file to avoid PowerShell escape issues
    # with Arabic text + nested quotes (this is what broke the v3.74.150 attempt).
    $msgPath = Join-Path $env:TEMP "commit_v3_74_150.txt"
    $msgLines = @(
        "fix(payments): v3.74.150 - drop suppliers(name) inline JOIN",
        "",
        "Root cause of the persistent 404 on resubmit-after-reject:",
        "There is no FK between payments.supplier_id and suppliers.id in this",
        "schema (zero rows in pg_constraint matching). PostgREST refuses the",
        "inline embedding 'suppliers(name)' without an FK and returns:",
        "  'Could not find a relationship between payments and suppliers in",
        "   the schema cache'",
        "Supabase JS surfaces that as { data: null, error: ... } and our",
        "guard 'if (payErr || !pay) return 404' fires with the Arabic",
        "message the user has been seeing. The DB row exists; the user",
        "has membership; service client bypasses RLS - the join is the",
        "only thing failing.",
        "",
        "Diagnosed by reading the API response body directly from the",
        "browser via DevTools/JS - the debug payload added in v3.74.149",
        "showed the real payErr text from PostgREST.",
        "",
        "Fix:",
        "  app/api/payments/[id]/resubmit-after-reject/route.ts",
        "    - Removed suppliers(name) from the main payments select.",
        "    - Added a separate best-effort select on suppliers.name",
        "      that runs after the row is loaded; the name is used only",
        "      in the notification text. If the lookup fails we omit",
        "      the supplier name from the message.",
        "    - The sibling routes vendor-request-correction and",
        "      request-correction already use this pattern, which is why",
        "      only resubmit-after-reject was broken.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.150.",
        "",
        "Followups (out of scope for this hotfix):",
        "  - Audit other endpoints that embed without FKs.",
        "  - Consider adding an FK on payments.supplier_id after a",
        "    legacy-row cleanup pass."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.150 pushed" -ForegroundColor Green
}
