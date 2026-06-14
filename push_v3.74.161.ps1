$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.160.ps1") { Remove-Item -LiteralPath "push_v3.74.160.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.161"') { Write-Host "+ 3.74.161" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

# Sanity check: useMemo for filteredCustomerPayments must come BEFORE `if (loading)`
$page = Get-Content -LiteralPath "app/payments/page.tsx" -Raw
$idxMemo = $page.IndexOf('const filteredCustomerPayments = useMemo')
$idxLoading = $page.IndexOf('if (loading) {')
if ($idxMemo -lt 0 -or $idxLoading -lt 0) {
    Write-Host "X structure check failed: markers missing" -ForegroundColor Red
    exit 1
}
if ($idxMemo -gt $idxLoading) {
    Write-Host "X useMemo is AFTER 'if (loading)' — hotfix not applied" -ForegroundColor Red
    exit 1
}
Write-Host "+ useMemo hoisted above 'if (loading)' (Hooks rule)" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_161.txt"
    $msgLines = @(
        "fix(payments): v3.74.161 hotfix - React error #310 on /payments",
        "",
        "v3.74.160 added two new useMemo hooks for the filter bar",
        "(filteredCustomerPayments and filteredSupplierPayments) but",
        "declared them AFTER the early `if (loading) return ...` block.",
        "",
        "On first render `loading` is true and the component returns",
        "before reaching the new memos, so React counts N hooks. On the",
        "next render `loading` flips to false and the memos run, so",
        "React counts N+2 hooks. The hook count mismatch triggers React",
        "error #310 (Rendered more hooks than during the previous",
        "render) and the page crashes into the global ErrorBoundary",
        "(the user-visible 'حدث خطأ في التطبيق' screen).",
        "",
        "Browser console from the broken deploy confirmed the call",
        "site - the stack pointed at useMemo as the failing hook.",
        "",
        "Fix:",
        "  app/payments/page.tsx",
        "    - Hoist applyPaymentFilters() and both useMemo calls to",
        "      ABOVE the `if (loading)` early return. The plain const",
        "      helpers (cpActive, clearCpFilters, statusOptionsAr/En,",
        "      renderPaymentFilters) are not hooks so they stay where",
        "      they were.",
        "    - Inline comment explains the constraint so the next",
        "      person touching the file doesn't reintroduce the bug.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.161.",
        "",
        "No functional change - the filters still work identically,",
        "they just run in the right place in the render now.",
        "",
        "How to verify:",
        "  - Open /payments. The page renders instead of crashing.",
        "  - Filters above each table behave exactly as in v3.74.160",
        "    on a working render (search, status chips, date range).",
        "  - No 'حدث خطأ في التطبيق' fallback."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.161 pushed" -ForegroundColor Green
}
