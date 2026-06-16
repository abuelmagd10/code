$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.178.ps1") { Remove-Item -LiteralPath "push_v3.74.178.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.179"') { Write-Host "+ 3.74.179" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/suppliers/page.tsx" -Raw
if ($page -notmatch "latestRequest") {
    Write-Host "X latest-request lookup missing" -ForegroundColor Red
    exit 1
}
Write-Host "+ refund guard looks at latest request only" -ForegroundColor Green

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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_179.txt"
    $msgLines = @(
        "fix(suppliers): v3.74.179 - latest refund request decides the pill, not any historical match",
        "",
        "Tester report after v3.74.178:",
        "  Owner rejected the new refund request for محمد الصاوى (3 EGP).",
        "  Reject notification arrived at the accountant. But the suppliers",
        "  row still shows '✓ استرداد مُعتَمَد' instead of letting the",
        "  accountant resubmit.",
        "",
        "Root cause:",
        "  v3.74.178 widened the active-request check to status IN",
        "  ('pending_approval', 'approved') so the in-flight window is",
        "  fully covered. Side effect: an old request from a previous",
        "  cycle that was approved + executed months ago still has",
        "  status='approved' (the table has no executed_at / closed_at",
        "  column to clear it). The .find() walked the full list and",
        "  surfaced that historical row, freezing the supplier on",
        "  '✓ refund approved' forever - even after the actual latest",
        "  request had just been rejected.",
        "",
        "Fix:",
        "  app/suppliers/page.tsx",
        "    - refundRequests is already ordered created_at DESC. The",
        "      guard now picks the FIRST row that matches the supplier",
        "      (= the latest request for that supplier) and decides from",
        "      that single row. Historical approved rows on top of a",
        "      newer rejected row no longer leak into the button state.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.179.",
        "",
        "Decision matrix the supplier row now follows:",
        "  latest = pending_approval -> '⏳ استرداد قَيد الاعتماد' pill",
        "  latest = approved         -> '✓ استرداد مُعتَمَد' pill",
        "  latest = rejected         -> active 'استرداد نقدى' button",
        "  latest = cancelled        -> active 'استرداد نقدى' button",
        "  no refund requests at all -> active 'استرداد نقدى' button",
        "",
        "How to verify:",
        "  - Approve a fresh refund request. Pill shows '✓ مُعتَمَد'.",
        "  - On a different supplier with an older 'approved' row from",
        "    a long-closed cycle and no newer rows, the pill still",
        "    shows '✓ مُعتَمَد' (correct - the latest request has not",
        "    been replaced).",
        "  - Reject a fresh request. Pill clears; active button comes",
        "    back so the accountant can fix and resubmit. This is the",
        "    state the tester is verifying right now."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.179 pushed" -ForegroundColor Green
}
