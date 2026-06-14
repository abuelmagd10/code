$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.150.ps1") { Remove-Item -LiteralPath "push_v3.74.150.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.151"') { Write-Host "+ 3.74.151" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$endpoint = Get-Content -LiteralPath "app/api/users/display-names/route.ts" -Raw
if ($endpoint.TrimEnd().EndsWith("}")) {
    Write-Host "+ display-names endpoint intact" -ForegroundColor Green
} else {
    Write-Host "X display-names endpoint truncated!" -ForegroundColor Red
    exit 1
}

$modal = Get-Content -LiteralPath "components/payments/PaymentDetailsModal.tsx" -Raw
if ($modal.TrimEnd().EndsWith("}")) {
    Write-Host "+ PaymentDetailsModal intact" -ForegroundColor Green
} else {
    Write-Host "X PaymentDetailsModal truncated!" -ForegroundColor Red
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_151.txt"
    $msgLines = @(
        "fix(payments): v3.74.151 - resolve owner names in approval trail",
        "",
        "User report: the approval trail inside the payment-details modal",
        "showed Unknown user for the rejection rows even though the owner",
        "(7esab.erb@gmail.com) clearly performed the action. Same pattern",
        "appeared on the APPROVE_STAGE rows.",
        "",
        "Root cause: PaymentDetailsModal.tsx resolves names from",
        "company_members, falling back to employee.full_name and then",
        "company_members.email. For the owner row in this tenant the",
        "email column on company_members is NULL (legacy data: that",
        "column was added later and was never backfilled for owner",
        "rows). The fallback chain stopped at the null email, so the",
        "modal labelled the row Unknown user.",
        "",
        "The cleanest fallback is auth.users.email, but the browser",
        "can't read auth.users directly under RLS. v3.74.151 adds a",
        "small POST endpoint that returns display names for a list of",
        "user_ids, scoped to the caller's active company.",
        "",
        "Fix:",
        "  app/api/users/display-names/route.ts (new)",
        "    - Authenticates the caller and confirms they are a member",
        "      of the active company.",
        "    - For each requested user_id confirms it also belongs to",
        "      the same company - cross-tenant ids are dropped silently.",
        "    - Returns { user_id: label } where label is the first",
        "      non-empty of employee.full_name, company_members.email,",
        "      then auth.users.email (looked up via service client +",
        "      admin.listUsers).",
        "",
        "  components/payments/PaymentDetailsModal.tsx",
        "    - After the existing company_members lookup, any audit-log",
        "      changed_by id that still has no label is passed to the",
        "      new endpoint and the returned name is filled in.",
        "    - Same fallback applied to the payment's creator_name row,",
        "      which had the same blind spot for legacy owner rows.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.151.",
        "",
        "After this the rejection rows show 7esab.erb@gmail.com (or the",
        "owner's employee name when one is linked) instead of Unknown",
        "user, end-to-end, without touching company_members data."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.151 pushed" -ForegroundColor Green
}
