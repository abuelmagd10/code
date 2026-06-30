$ErrorActionPreference = "Continue"
$env:GIT_PAGER = "cat"
Set-Location "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"

if (Test-Path ".git/index.lock") { Remove-Item ".git/index.lock" -Force }
if (Test-Path "push_v3.74.412.ps1") { Remove-Item -LiteralPath "push_v3.74.412.ps1" -Force }

$v = Get-Content -LiteralPath "lib/version.ts" -Raw
if ($v -match 'APP_VERSION = "3.74.413"') {
    Write-Host "+ 3.74.413" -ForegroundColor Green
} else { Write-Host "X version mismatch" -ForegroundColor Red; exit 1 }

$page = Get-Content -LiteralPath "app/banking/page.tsx" -Raw
foreach ($n in @('v3.74.413', 'const reason', 'err?.message')) {
    if ($page -notmatch [regex]::Escape($n)) {
        Write-Host "X banking page missing: $n" -ForegroundColor Red; exit 1
    }
}
# guard against regression: the old, reason-less toast call
if ($page -match 'toastActionError\(toast, appLang === "en" \? "Transfer" : "التحويل"\);') {
    Write-Host "X banking page still has the reason-less toast call" -ForegroundColor Red; exit 1
}
Write-Host "+ transfer toast now passes the underlying reason" -ForegroundColor Green

Write-Host "Running tsc..." -ForegroundColor Cyan
$tsc = & npx tsc --noEmit -p tsconfig.json 2>&1
$err = ($tsc | Select-String -Pattern "error TS").Count
if ($err -eq 0) {
    Write-Host "+ 0 TS errors" -ForegroundColor Green
} else {
    Write-Host "X $err TS errors" -ForegroundColor Red
    $tsc | Select-String -Pattern "error TS" | Select-Object -First 15 | ForEach-Object { Write-Host $_ }
    exit 1
}

git add -A 2>&1 | Out-Null
git --no-pager diff --cached --stat
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing to commit" -ForegroundColor Yellow
} else {
    $msgPath = Join-Path $env:TEMP "commit_v3_74_413.txt"
    $msgLines = @(
        'fix(banking): v3.74.413 - surface the real reason on a failed transfer',
        '',
        'Owner reported: when a bank transfer fails (e.g. insufficient',
        'balance in the source account), the UI shows a generic "فشل',
        'التحويل" toast without the actual cause. The cause is on the',
        'server: assertCashOutflowAllowed throws CashOverdraftError',
        'with a bilingual message ("❌ لا يمكن السحب: رصيد الحساب ...",',
        '"Cannot withdraw — insufficient funds in account ...") and the',
        'API does propagate result.error correctly, but the UI catch',
        'block was calling toastActionError without the description',
        'argument, so the message got dropped on the floor.',
        '',
        'Fix: the catch block now reads err.message and passes it as',
        'the toast description. So the user gets the exact reason',
        '(account name + current balance + attempted amount) instead',
        'of a vague "failed".',
        '',
        'Files',
        '  app/banking/page.tsx',
        '  lib/version.ts -> 3.74.413'
    )
    Set-Content -LiteralPath $msgPath -Value $msgLines -Encoding UTF8
    git commit -F $msgPath 2>&1 | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $msgPath -Force -ErrorAction SilentlyContinue
}

git push origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n+ v3.74.413 pushed - failed transfer now shows the real reason" -ForegroundColor Green
}
