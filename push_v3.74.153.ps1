$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.152.ps1") { Remove-Item -LiteralPath "push_v3.74.152.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.153"') { Write-Host "+ 3.74.153" -ForegroundColor Green } else { Write-Host "X" -ForegroundColor Red; exit 1 }

$nc = Get-Content -LiteralPath "components/NotificationCenter.tsx" -Raw
if ($nc.TrimEnd().EndsWith("}")) {
    Write-Host "+ NotificationCenter intact" -ForegroundColor Green
} else {
    Write-Host "X NotificationCenter truncated!" -ForegroundColor Red
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
    $msgPath = Join-Path $env:TEMP "commit_v3_74_153.txt"
    $msgLines = @(
        "fix(notifications): v3.74.153 - sort notification list by date first",
        "",
        "User report: a 1-minute-old 'payment approved' notification (normal",
        "priority) was rendered below a 24-hour-old 'invoice rejected'",
        "notification (high priority). The user expected the newest item on",
        "top regardless of priority - this is how every notification UI in",
        "the rest of the product behaves.",
        "",
        "Root cause: components/NotificationCenter.tsx sorted twice -",
        "once on initial fetch and once on every realtime upsert - and",
        "both comparators were priority-first, then date as a tiebreaker.",
        "That meant any high/critical row produced today stayed above any",
        "normal/low row, even when the normal row was newer.",
        "",
        "Fix:",
        "  components/NotificationCenter.tsx",
        "    - Both sort blocks now compare created_at descending first and",
        "      fall back to priority only when timestamps tie. Newest row is",
        "      always on top.",
        "",
        "  lib/version.ts",
        "    - Bumped to 3.74.153."
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8

    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.153 pushed" -ForegroundColor Green
}
