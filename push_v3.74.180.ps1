$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.179.ps1") { Remove-Item -LiteralPath "push_v3.74.179.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.180"') { Write-Host "+ 3.74.180" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/suppliers/page.tsx" -Raw
if ($page -notmatch 'refund_history') {
    Write-Host "X refund_history tab missing" -ForegroundColor Red
    exit 1
}
if ($page -notmatch 'seesAllBranches') {
    Write-Host "X branch governance for refund history missing" -ForegroundColor Red
    exit 1
}
Write-Host "+ refund history tab + branch governance wired" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_180.txt"
    $msgLines = @(
        "feat(suppliers): v3.74.180 - refund history tab with branch governance",
        "",
        "Tester request: add a refund history view to /suppliers so the",
        "branch accountant can see what happened to every cash refund",
        "request they filed (and so management can audit the whole",
        "company's history).",
        "",
        "Spec:",
        "  - owner / admin / general_manager: company-wide history.",
        "  - everyone else (e.g., accountant): only their own branch.",
        "",
        "Implementation:",
        "",
        "  app/suppliers/page.tsx",
        "    - loadRefundRequests now branch-scopes the SELECT for non-",
        "      privileged roles. RLS only enforces the company boundary,",
        "      so without this filter the accountant would see other",
        "      branches' rows too. Pulls supplier + branch + receipt",
        "      account names in the same query so the table can render",
        "      without follow-up lookups.",
        "    - New 'refund_history' TabsTrigger, visible to everyone.",
        "      The existing 'refund_approvals' tab stays privileged-only",
        "      because it is the action queue (pending rows with",
        "      approve/reject buttons).",
        "    - New TabsContent renders the full history as a table:",
        "        supplier | amount | account | branch | status |",
        "        requested | decided | reason",
        "      with colored status pills (pending / approved / rejected /",
        "      cancelled). Subtitle tells the user which scope they are",
        "      viewing ('Company-wide view' vs 'Your branch only').",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.180.",
        "",
        "How to verify:",
        "  - Sign in as the مدينة نصر branch accountant",
        "    (foodcana1976). Open /suppliers and switch to 'سِجِل",
        "    الاسترداد'. Only requests filed in مدينة نصر appear, with",
        "    the subtitle 'فَرعُك فَقَط'. The reject reason column for",
        "    319f20bc shows 'لية هديلة'.",
        "  - Sign in as the owner (7esab.erb). Same tab now lists every",
        "    branch's requests with subtitle 'عَرض على مُستَوى الشَّركَة'.",
        "  - The Refund Approvals tab keeps showing only pending rows -",
        "    it is the work queue, not the log."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.180 pushed" -ForegroundColor Green
}
